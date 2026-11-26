import { emailVerified } from '../security/email-proof.js';
/** @file Durable email jobs with fenced claims and bounded retries across replicas. */
import { randomUUID } from 'node:crypto';
const delays = [60000, 300000, 900000, 3600000, 21600000];
export class MongoOutboxStore {
  constructor(repository, { now } = {}) {
    this.repo = repository;
    this.outbox = repository.c('outbox');
    this.now = now;
  }
  clock() {
    return this.now ? this.now() : { $toLong: '$$NOW' };
  }
  async claim() {
    const leaseToken = randomUUID(),
      time = this.clock();
    await this.outbox.updateMany(
      { status: 'sending', $expr: { $lte: ['$leaseUntil', time] }, attempts: { $gte: 5 } },
      { $set: { status: 'failed', lastErrorCode: 'SMTP_DELIVERY_UNKNOWN' } },
    );
    return this.outbox.findOneAndUpdate(
      {
        attempts: { $lt: 5 },
        $or: [
          {
            status: { $in: ['pending', 'failed', 'verification_required'] },
            $expr: { $lte: ['$nextAttemptAt', time] },
          },
          { status: 'sending', $expr: { $lte: ['$leaseUntil', time] } },
        ],
      },
      [
        {
          $set: {
            status: 'sending',
            leaseUntil: { $add: [time, 120000] },
            leaseToken,
            attempts: { $add: ['$attempts', 1] },
          },
        },
      ],
      { sort: { _id: 1 }, returnDocument: 'after' },
    );
  }
  async record(job) {
    const record =
      job.kind === 'notice'
        ? await this.repo.reminders.message(job, 'email')
        : await this.repo.c('bookings').findOne({ _id: job.bookingId });
    if (
      !record ||
      record.suppress ||
      (job.kind !== 'notice' && record.status === 'cancelled') ||
      job.audience === 'admin'
    )
      return record;
    const recipient = record.recipientOverride || job.recipient;
    let expected = record.userId || job.recipientUserId;
    if (!expected && job.bookingId)
      expected = (await this.repo.c('bookings').findOne({ _id: job.bookingId }))?.userId;
    if (!expected && job.boatId)
      expected = (await this.repo.c('boats').findOne({ _id: job.boatId }))?.ownerId;
    const user =
      typeof recipient === 'string' && expected
        ? await this.repo.c('users').findOne({ _id: expected, email: recipient.toLowerCase() })
        : null;
    return emailVerified(user) ? record : { holdForVerification: true };
  }
  deferForVerification(job) {
    return this.outbox.updateOne(this.fence(job), {
      $set: {
        status: 'verification_required',
        nextAttemptAt: Date.now() + 300000,
        attempts: Math.max(0, job.attempts - 1),
        leaseUntil: 0,
      },
      $unset: { leaseToken: '' },
    });
  }
  suppress(job) {
    return this.outbox.updateOne(this.fence(job), {
      $set: { status: 'suppressed', leaseUntil: 0 },
      $unset: { leaseToken: '' },
    });
  }
  fence(job) {
    return { _id: job._id, leaseToken: job.leaseToken, status: 'sending' };
  }
  succeed(job) {
    return this.outbox.updateOne(this.fence(job), {
      $set: {
        status: 'sent',
        sentAt: new Date(this.now ? this.now() : Date.now()).toISOString(),
        leaseUntil: 0,
      },
      $unset: { leaseToken: '', lastErrorCode: '' },
    });
  }
  fail(job) {
    return this.outbox.updateOne(this.fence(job), [
      {
        $set: {
          status: 'failed',
          leaseUntil: 0,
          nextAttemptAt: { $add: [this.clock(), delays[Math.min(job.attempts - 1, 4)]] },
          lastErrorCode: 'SMTP_SEND_FAILED',
        },
      },
      { $unset: 'leaseToken' },
    ]);
  }
  retry(id) {
    return this.outbox.updateMany(
      { bookingId: id, status: 'failed' },
      { $set: { status: 'pending', attempts: 0, nextAttemptAt: 0, leaseUntil: 0 } },
    );
  }
}
