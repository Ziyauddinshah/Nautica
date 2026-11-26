/** @file Admin-approved refund issuance, durable reconciliation and financial audit events. */
import { randomUUID } from 'node:crypto';
import { ApiError } from '../errors.js';
import { refundView, reason } from './policy.js';
import { bookingNotice, enqueueNotice } from './notices.js';
const finalStates = ['processed', 'simulated'];
const key = (row) => row._id + '-' + row.generation;
export class Refunds {
  constructor(repo, gateway) {
    this.repo = repo;
    this.gateway = gateway;
  }
  c(name) {
    return this.repo.c(name);
  }
  async get(id) {
    const row = await this.c('refunds').findOne({
      _id: id,
    });
    if (!row) throw new ApiError(404, 'Refund not found.');
    return row;
  }
  validate(row, remote) {
    if (
      !remote ||
      typeof remote.id !== 'string' ||
      !/^rfnd_[a-zA-Z0-9]+$/.test(remote.id) ||
      remote.payment_id !== row.paymentId ||
      remote.amount !== row.amount ||
      remote.currency !== 'INR' ||
      !['pending', 'processed', 'failed'].includes(remote.status)
    )
      throw new ApiError(409, 'Refund evidence does not match this payment.');
  }
  async apply(id, remote, job = null) {
    return this.repo.transaction(async (session) => {
      const row = await this.c('refunds').findOne(
        {
          _id: id,
        },
        {
          session,
        },
      );
      if (!row) return null;
      this.validate(row, remote);
      if (
        row.status === 'simulated' ||
        (row.status === 'processed' && remote.status !== 'processed')
      )
        return refundView({
          ...row,
          id: row._id,
        });
      if (
        job &&
        remote.status !== 'processed' &&
        ((job.leaseToken && row.leaseToken !== job.leaseToken) || row.generation !== job.generation)
      )
        return null;
      const oldStatus = row.status;
      row.status = remote.status;
      row.providerRefundId = remote.id;
      row.updatedAt = new Date().toISOString();
      row.nextCheckAt = Date.now() + (remote.status === 'processed' ? 3600000 : 300000);
      row.leaseUntil = 0;
      if (remote.status === 'processed')
        row.processedAt = row.processedAt || new Date().toISOString();
      const bank =
        remote.acquirer_data?.arn || remote.acquirer_data?.rrn || remote.acquirer_data?.utr;
      if (typeof bank === 'string' && bank.length <= 100) row.bankReference = bank;
      const view = refundView({
          ...row,
          id: row._id,
        }),
        paymentStatus =
          row.status === 'processed'
            ? 'refunded'
            : row.status === 'failed'
              ? 'refund_failed'
              : 'refund_pending';
      const stored = {
        ...row,
      };
      delete stored._id;
      delete stored.leaseToken;
      delete stored.lastErrorCode;
      await this.c('refunds').updateOne(
        {
          _id: id,
        },
        {
          $set: stored,
          $unset: {
            leaseToken: '',
            lastErrorCode: '',
          },
        },
        {
          session,
        },
      );
      await this.c('payments').updateOne(
        {
          _id: row.paymentRecordId,
        },
        {
          $set: {
            status: paymentStatus,
            refund: view,
          },
        },
        {
          session,
        },
      );
      if (row.bookingId) {
        const record = await this.c('bookings').findOne(
          {
            _id: row.bookingId,
          },
          {
            session,
          },
        );
        if (record) {
          record.payment = {
            ...record.payment,
            status: paymentStatus,
            refund: view,
          };
          record.refund = view;
          await this.c('bookings').updateOne(
            {
              _id: row.bookingId,
            },
            {
              $set: {
                payment: record.payment,
                refund: view,
                'pass.paymentStatus': paymentStatus,
              },
            },
            {
              session,
            },
          );
          if (oldStatus !== row.status)
            await bookingNotice(
              this.repo,
              record,
              'refund-' + row.generation + '-' + row.status,
              row.status === 'processed'
                ? 'Refund processed'
                : row.status === 'failed'
                  ? 'Refund needs attention'
                  : 'Refund processing',
              session,
            );
        }
      } else if (oldStatus !== row.status) {
        const payment = await this.c('payments').findOne(
          {
            _id: row.paymentRecordId,
          },
          {
            session,
          },
        );
        await enqueueNotice(
          this.repo,
          {
            id: 'notice:' + id + ':' + row.generation + ':' + row.status,
            notice: {
              event: 'refund_' + row.status,
              heading:
                row.status === 'processed'
                  ? 'Refund processed'
                  : row.status === 'failed'
                    ? 'Refund needs attention'
                    : 'Refund processing',
              body: 'Check My account for refund status. No journey was confirmed for this payment.',
              reference: id,
              language: payment?.payload?.language,
              fields: [['Refund amount', String(row.amount / 100) + ' INR']],
            },
            recipients: [
              {
                audience: 'customer',
                email: payment?.payload?.email,
                phone: payment?.payload?.phone,
              },
              {
                audience: 'admin',
              },
            ],
          },
          session,
        );
      }
      if (oldStatus !== row.status)
        await this.repo.cancellations.audit(
          'refund_' + row.status,
          'provider:Razorpay',
          id,
          session,
          {
            providerRefundId: remote.id,
          },
        );
      return view;
    });
  }
  async all(row) {
    const items = [];
    for (let skip = 0; skip < 1000; skip += 100) {
      const page = await this.gateway.listRefunds(row.paymentId, skip);
      if (!Array.isArray(page.items))
        throw new ApiError(503, 'Refund reconciliation is unavailable.');
      items.push(...page.items);
      if (page.items.length < 100) return items;
    }
    throw new ApiError(409, 'Refund history requires manual reconciliation.');
  }
  async evidence(row) {
    const items = await this.all(row);
    const full = items.find(
      (item) => item.amount === row.amount && ['processed', 'pending'].includes(item.status),
    );
    if (full) {
      this.validate(row, full);
      return {
        remote: full,
      };
    }
    const matching = items.find(
      (item) =>
        item.receipt === key(row) ||
        (item.notes?.nautica_refund_id === row._id &&
          String(item.notes?.generation) === String(row.generation)),
    );
    if (matching) {
      this.validate(row, matching);
      return {
        remote: matching,
      };
    }
    if (items.some((item) => item.status !== 'failed'))
      throw new ApiError(409, 'External partial refunds require manual reconciliation.');
    return {
      remote: null,
    };
  }
  async payment(row) {
    const payment = await this.gateway.getPayment(row.paymentId);
    if (
      payment.id !== row.paymentId ||
      payment.amount !== row.amount ||
      payment.currency !== 'INR' ||
      !['captured', 'refunded'].includes(payment.status) ||
      !Number.isSafeInteger(payment.amountRefunded)
    )
      throw new ApiError(409, 'Payment requires manual reconciliation.');
    return payment;
  }
  async mark(id, status, job, errorCode) {
    return this.repo.transaction(async (session) => {
      const row = await this.c('refunds').findOne(
        {
          _id: id,
        },
        {
          session,
        },
      );
      if (!row || row.status !== 'sending' || row.leaseToken !== job.leaseToken) return;
      row.status = status;
      row.updatedAt = new Date().toISOString();
      row.lastErrorCode = errorCode;
      row.nextCheckAt = Date.now() + 60000;
      row.leaseUntil = 0;
      const view = refundView({
          ...row,
          id,
        }),
        paymentStatus = status === 'manual_review' ? 'refund_attention' : 'refund_pending';
      await this.c('refunds').updateOne(
        {
          _id: id,
        },
        {
          $set: {
            status,
            updatedAt: row.updatedAt,
            lastErrorCode: errorCode,
            nextCheckAt: row.nextCheckAt,
            leaseUntil: 0,
          },
          $unset: {
            leaseToken: '',
          },
        },
        {
          session,
        },
      );
      await this.c('payments').updateOne(
        {
          _id: row.paymentRecordId,
        },
        {
          $set: {
            status: paymentStatus,
            refund: view,
          },
        },
        {
          session,
        },
      );
      if (row.bookingId)
        await this.c('bookings').updateOne(
          {
            _id: row.bookingId,
          },
          {
            $set: {
              refund: view,
              'payment.status': paymentStatus,
              'payment.refund': view,
              'pass.paymentStatus': paymentStatus,
            },
          },
          {
            session,
          },
        );
      if (row.bookingId) {
        const record = await this.c('bookings').findOne(
          {
            _id: row.bookingId,
          },
          {
            session,
          },
        );
        if (record)
          await bookingNotice(
            this.repo,
            record,
            'refund-' + row.generation + '-' + status,
            'Refund needs attention',
            session,
          );
      } else {
        const payment = await this.c('payments').findOne(
          {
            _id: row.paymentRecordId,
          },
          {
            session,
          },
        );
        await enqueueNotice(
          this.repo,
          {
            id: 'notice:' + id + ':' + row.generation + ':' + status,
            notice: {
              event: 'refund_' + status,
              heading: 'Refund needs attention',
              body: 'Check My account for refund status. No journey was confirmed for this payment.',
              reference: id,
              language: payment?.payload?.language,
              fields: [['Refund amount', String(row.amount / 100) + ' INR']],
            },
            recipients: [
              {
                audience: 'customer',
                email: payment?.payload?.email,
                phone: payment?.payload?.phone,
              },
              {
                audience: 'admin',
              },
            ],
          },
          session,
        );
      }
      await this.repo.cancellations.audit('refund_' + status, 'worker', id, session);
    });
  }
  async claim() {
    const expired = await this.c('refunds')
      .find({
        status: 'sending',
        $expr: {
          $lte: [
            '$leaseUntil',
            {
              $toLong: '$$NOW',
            },
          ],
        },
      })
      .limit(20)
      .toArray();
    for (const row of expired) await this.mark(row._id, 'unknown', row, 'REFUND_SEND_UNKNOWN');
    return this.repo.transaction(async (session) => {
      const row = await this.c('refunds').findOneAndUpdate(
        {
          status: 'queued',
        },
        [
          {
            $set: {
              status: 'sending',
              leaseToken: randomUUID(),
              leaseUntil: {
                $add: [
                  {
                    $toLong: '$$NOW',
                  },
                  120000,
                ],
              },
              attempts: {
                $add: [
                  {
                    $ifNull: ['$attempts', 0],
                  },
                  1,
                ],
              },
              firstAttemptAt: {
                $ifNull: ['$firstAttemptAt', '$$NOW'],
              },
            },
          },
        ],
        {
          session,
          returnDocument: 'after',
          sort: {
            createdAt: 1,
          },
        },
      );
      if (!row) return null;
      const view = refundView({
        ...row,
        id: row._id,
      });
      await this.c('payments').updateOne(
        {
          _id: row.paymentRecordId,
        },
        {
          $set: {
            status: 'refund_pending',
            refund: view,
          },
        },
        {
          session,
        },
      );
      if (row.bookingId)
        await this.c('bookings').updateOne(
          {
            _id: row.bookingId,
          },
          {
            $set: {
              refund: view,
              'payment.status': 'refund_pending',
              'payment.refund': view,
              'pass.paymentStatus': 'refund_pending',
            },
          },
          {
            session,
          },
        );
      return row;
    });
  }
  async send(job) {
    try {
      const payment = await this.payment(job),
        found = await this.evidence(job);
      if (found.remote) return this.apply(job._id, found.remote, job);
      if (job.providerVerified !== true)
        throw new ApiError(
          409,
          'Historical payment requires provider reconciliation before automated refund.',
        );
      if (payment.amountRefunded !== 0 || payment.status !== 'captured')
        throw new ApiError(409, 'Payment requires manual reconciliation.');
      const remote = await this.gateway.createRefund(
        job.paymentId,
        {
          amount: job.amount,
          speed: 'normal',
          receipt: key(job),
          notes: {
            nautica_refund_id: job._id,
            generation: String(job.generation),
          },
        },
        key(job),
      );
      return await this.apply(job._id, remote, job);
    } catch (error) {
      await this.mark(
        job._id,
        (error instanceof ApiError && error.status === 409) || error.refundRejected
          ? 'manual_review'
          : 'unknown',
        job,
        error.refundRejected ? 'PROVIDER_REJECTED' : 'REFUND_RECONCILE',
      );
    }
  }
  async poll(row) {
    if (row.providerRefundId)
      return this.apply(
        row._id,
        await this.gateway.getRefund(row.paymentId, row.providerRefundId),
        {
          generation: row.generation,
        },
      );
    const found = await this.evidence(row);
    if (found.remote)
      return this.apply(row._id, found.remote, {
        generation: row.generation,
      });
    return null;
  }
  async reconcile(id, admin, input = {}) {
    const row = await this.get(id);
    if (row.status === 'simulated')
      return refundView({
        ...row,
        id: row._id,
      });
    if (row.status === 'processed' && this.gateway.enabled && row.providerRefundId) {
      await this.apply(row._id, await this.gateway.getRefund(row.paymentId, row.providerRefundId));
      return refundView({
        ...(await this.get(id)),
        id,
      });
    }
    if (row.status === 'processed')
      return refundView({
        ...row,
        id,
      });
    if (!this.gateway.enabled) throw new ApiError(503, 'Refund service is unavailable.');
    if (input.providerRefundId) {
      reason(input.reason);
      if (
        typeof input.providerRefundId !== 'string' ||
        !/^rfnd_[a-zA-Z0-9]{1,100}$/.test(input.providerRefundId)
      )
        throw new ApiError(400, 'Enter a valid Razorpay refund reference.');
      if (row.status === 'pending' && row.providerRefundId !== input.providerRefundId)
        throw new ApiError(409, 'A refund is already processing.');
      await this.apply(id, await this.gateway.getRefund(row.paymentId, input.providerRefundId));
    } else await this.poll(row);
    await this.repo.cancellations.audit('refund_reconciled', 'admin:' + admin, id);
    return refundView({
      ...(await this.get(id)),
      id,
    });
  }
  async retry(id, admin, input) {
    reason(input?.reason);
    let row = await this.get(id);
    if (!['unknown', 'failed', 'manual_review'].includes(row.status))
      throw new ApiError(409, 'This refund cannot be retried.');
    if (!this.gateway.enabled) throw new ApiError(503, 'Refund service is unavailable.');
    await this.poll(row);
    row = await this.get(id);
    if (finalStates.includes(row.status) || row.status === 'pending')
      return refundView({
        ...row,
        id,
      });
    if (row.providerVerified !== true)
      throw new ApiError(
        409,
        'Historical payment requires provider reconciliation before automated refund.',
      );
    if (
      row.status === 'unknown' &&
      (!row.firstAttemptAt || Date.now() - new Date(row.firstAttemptAt).getTime() > 86400000)
    )
      throw new ApiError(
        409,
        'An old uncertain refund needs provider reconciliation; do not issue a new refund.',
      );
    const payment = await this.payment(row);
    if (payment.amountRefunded !== 0)
      throw new ApiError(409, 'Payment requires manual reconciliation.');
    return this.repo.transaction(async (session) => {
      const latest = await this.c('refunds').findOne(
        {
          _id: id,
        },
        {
          session,
        },
      );
      if (latest.status !== row.status || latest.generation !== row.generation)
        throw new ApiError(409, 'Refund changed. Reload before retrying.');
      const generation = row.status === 'failed' ? row.generation + 1 : row.generation;
      if (generation > 3)
        throw new ApiError(409, 'Refund retry limit reached. Contact payment support.');
      await this.c('refunds').updateOne(
        {
          _id: id,
        },
        {
          $set: {
            status: 'queued',
            generation,
            updatedAt: new Date().toISOString(),
            nextCheckAt: 0,
            ...(generation !== row.generation
              ? {
                  providerRefundId: null,
                  firstAttemptAt: null,
                  attempts: 0,
                }
              : {}),
          },
          $unset: {
            leaseToken: '',
          },
        },
        {
          session,
        },
      );
      const view = refundView({
        ...latest,
        id,
        status: 'queued',
        generation,
      });
      await this.c('payments').updateOne(
        {
          _id: latest.paymentRecordId,
        },
        {
          $set: {
            status: 'refund_pending',
            refund: view,
          },
        },
        {
          session,
        },
      );
      if (latest.bookingId)
        await this.c('bookings').updateOne(
          {
            _id: latest.bookingId,
          },
          {
            $set: {
              refund: view,
              'payment.status': 'refund_pending',
              'payment.refund': view,
              'pass.paymentStatus': 'refund_pending',
            },
          },
          {
            session,
          },
        );
      await this.repo.cancellations.audit('refund_retry', 'admin:' + admin, id, session, {
        generation,
        reason: input.reason.trim(),
      });
      return refundView({
        ...latest,
        id,
        status: 'queued',
        generation,
      });
    });
  }
  async webhook(refundId) {
    const remote = await this.gateway.fetchRefund(refundId);
    let row = await this.c('refunds').findOne({
      providerRefundId: remote.id,
    });
    if (!row && typeof remote.notes?.nautica_refund_id === 'string')
      row = await this.c('refunds').findOne({
        _id: remote.notes.nautica_refund_id,
      });
    if (!row) return;
    if (
      remote.status !== 'processed' &&
      remote.receipt !== key(row) &&
      remote.id !== row.providerRefundId
    )
      return;
    return this.apply(row._id, remote);
  }
  async drain({ shouldStop = () => false } = {}) {
    if (!this.gateway.enabled) return;
    for (let i = 0; i < 20 && !shouldStop(); i++) {
      const job = await this.claim();
      if (!job) break;
      await this.send(job);
    }
    for (let i = 0; i < 20 && !shouldStop(); i++) {
      const row = await this.c('refunds').findOneAndUpdate(
        {
          $or: [
            {
              status: {
                $in: ['pending', 'unknown'],
              },
            },
            {
              status: 'processed',
              bankReference: {
                $exists: false,
              },
              processedAt: {
                $gt: new Date(Date.now() - 7 * 86400000).toISOString(),
              },
            },
          ],
          $expr: {
            $lte: [
              '$nextCheckAt',
              {
                $toLong: '$$NOW',
              },
            ],
          },
        },
        [
          {
            $set: {
              nextCheckAt: {
                $add: [
                  {
                    $toLong: '$$NOW',
                  },
                  300000,
                ],
              },
            },
          },
        ],
        {
          returnDocument: 'after',
          sort: {
            nextCheckAt: 1,
          },
        },
      );
      if (!row) break;
      try {
        await this.poll(row);
      } catch {
        /* Read-only reconciliation retries later, without issuing another refund. */
      }
    }
  }
}
