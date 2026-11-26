/** @file Cancellation eligibility, requests, approvals and atomic seat release. */
import { randomUUID } from 'node:crypto';
import { ApiError } from '../errors.js';
import { cancellationInfo, cancellationPolicy, reason, refundView } from './policy.js';
import { bookingNotice, enqueueNotice } from './notices.js';
export class Cancellations {
  constructor(repo) {
    this.repo = repo;
    this.policy = cancellationPolicy();
  }
  c(name) {
    return this.repo.c(name);
  }
  async audit(action, actor, reference, session, extra = {}) {
    await this.c('financial_audit').insertOne(
      {
        _id: randomUUID(),
        action,
        actor,
        reference,
        at: new Date().toISOString(),
        ...extra,
      },
      {
        session,
      },
    );
  }
  async request(id, user, input) {
    const text = reason(input?.reason);
    if (input.acceptPolicy !== true)
      throw new ApiError(400, 'Accept the cancellation policy before requesting cancellation.');
    return this.repo.transaction(async (session) => {
      const record = await this.c('bookings').findOneAndUpdate(
        {
          _id: id,
          userId: user.id,
        },
        {
          $currentDate: {
            cancellationCheckedAt: true,
          },
        },
        {
          session,
          returnDocument: 'after',
        },
      );
      if (!record) throw new ApiError(404, 'Booking not found.');
      if (record.cancellation?.status === 'requested' || record.status === 'cancelled')
        return cancellationInfo(record);
      const info = cancellationInfo(record, record.cancellationCheckedAt);
      if (!info.canRequest)
        throw new ApiError(409, 'The cancellation deadline has passed. Contact support.');
      record.cancellation = {
        status: 'requested',
        revision: info.revision + 1,
        reason: text,
        requestedAt: record.cancellationCheckedAt.toISOString(),
        requestedBy: user.id,
      };
      record.cancellationPolicy = info.policy;
      await this.c('bookings').updateOne(
        {
          _id: id,
        },
        {
          $set: {
            cancellation: record.cancellation,
            cancellationPolicy: record.cancellationPolicy,
            'pass.cancellationPending': true,
          },
        },
        {
          session,
        },
      );
      await this.audit('cancellation_requested', 'user:' + user.id, id, session, {
        reason: text,
        policy: info.policy,
        deadline: info.deadline,
      });
      await bookingNotice(
        this.repo,
        record,
        'cancel-request-' + record.cancellation.revision,
        'Cancellation requested',
        session,
      );
      return cancellationInfo(record);
    });
  }
  async withdraw(id, user, input) {
    if (!Number.isInteger(input?.revision))
      throw new ApiError(400, 'Choose the current cancellation revision.');
    return this.repo.transaction(async (session) => {
      const record = await this.c('bookings').findOne(
        {
          _id: id,
          userId: user.id,
        },
        {
          session,
        },
      );
      if (!record) throw new ApiError(404, 'Booking not found.');
      if (record.status === 'confirmed' && record.cancellation?.status === 'withdrawn')
        return cancellationInfo(record);
      if (
        record.status !== 'confirmed' ||
        record.cancellation?.status !== 'requested' ||
        record.cancellation.revision !== input.revision
      )
        throw new ApiError(409, 'This request was already reviewed. Reload before withdrawing.');
      record.cancellation = {
        ...record.cancellation,
        status: 'withdrawn',
        revision: record.cancellation.revision + 1,
      };
      await this.c('bookings').updateOne(
        {
          _id: id,
        },
        {
          $set: {
            cancellation: record.cancellation,
            'pass.cancellationPending': false,
          },
        },
        {
          session,
        },
      );
      await this.audit('cancellation_withdrawn', 'user:' + user.id, id, session);
      await bookingNotice(
        this.repo,
        record,
        'cancel-withdrawn-' + record.cancellation.revision,
        'Cancellation request withdrawn',
        session,
      );
      return cancellationInfo(record);
    });
  }
  async createRefund(payment, record, actor, session) {
    const existing = await this.c('refunds').findOne(
      {
        paymentRecordId: payment._id,
      },
      {
        session,
      },
    );
    if (existing) return existing;
    const simulated = payment.status === 'demo_paid',
      verified = payment.verification === 'provider_verified' && payment.provider === 'Razorpay';
    const row = {
      _id: 'RF-' + randomUUID().replaceAll('-', ''),
      paymentRecordId: payment._id,
      bookingId: record?.id || null,
      userId: payment.userId,
      paymentId: payment.paymentId || payment.reference,
      amount: payment.amount,
      currency: 'INR',
      provider: simulated ? 'Simulation' : payment.provider || 'Historical',
      providerVerified: verified,
      status: simulated ? 'simulated' : verified ? 'queued' : 'manual_review',
      generation: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      nextCheckAt: 0,
      attempts: 0,
    };
    if (!Number.isSafeInteger(row.amount) || row.amount < 1 || payment.currency !== 'INR')
      throw new ApiError(409, 'Payment requires manual reconciliation.');
    await this.c('refunds').insertOne(row, {
      session,
    });
    await this.c('payments').updateOne(
      {
        _id: payment._id,
      },
      {
        $set: {
          status: simulated ? 'demo_refunded' : verified ? 'refund_pending' : 'refund_attention',
          refund: refundView({
            ...row,
            id: row._id,
          }),
        },
      },
      {
        session,
      },
    );
    await this.audit('refund_approved', actor, row._id, session, {
      paymentRecordId: payment._id,
      amount: row.amount,
    });
    return row;
  }
  async decide(id, admin, input) {
    const text = reason(input?.reason);
    if (
      !['approve', 'reject', 'cancel'].includes(input?.action) ||
      !Number.isInteger(input.revision)
    )
      throw new ApiError(400, 'Choose a cancellation action and current revision.');
    return this.repo.transaction(async (session) => {
      const record = await this.c('bookings').findOne(
        {
          _id: id,
        },
        {
          session,
        },
      );
      if (!record) throw new ApiError(404, 'Booking not found.');
      const current = record.cancellation || {
        revision: 0,
      };
      if (record.status === 'cancelled' && ['approve', 'cancel'].includes(input.action))
        return cancellationInfo(record);
      if (current.revision !== input.revision)
        throw new ApiError(409, 'Booking changed. Reload before deciding.');
      if (
        record.status !== 'confirmed' ||
        (input.action !== 'cancel' && current.status !== 'requested')
      )
        throw new ApiError(409, 'This cancellation cannot be reviewed.');
      record.cancellation = {
        ...current,
        status: input.action === 'reject' ? 'rejected' : 'approved',
        revision: current.revision + 1,
        decisionReason: text,
        decidedAt: new Date().toISOString(),
        decidedBy: admin,
      };
      if (input.action === 'reject') {
        await this.c('bookings').updateOne(
          {
            _id: id,
          },
          {
            $set: {
              cancellation: record.cancellation,
              'pass.cancellationPending': false,
            },
          },
          {
            session,
          },
        );
        await this.audit('cancellation_rejected', 'admin:' + admin, id, session, {
          reason: text,
        });
        await bookingNotice(
          this.repo,
          record,
          'cancel-reject-' + record.cancellation.revision,
          'Cancellation declined',
          session,
        );
        return cancellationInfo(record);
      }
      const payment = await this.c('payments').findOne(
        {
          bookingId: id,
          kind: 'booking_payment',
        },
        {
          session,
        },
      );
      if (!payment) throw new ApiError(409, 'Payment requires manual reconciliation.');
      const refund = await this.createRefund(payment, record, 'admin:' + admin, session);
      record.status = 'cancelled';
      record.refund = refundView({
        ...refund,
        id: refund._id,
      });
      record.payment = {
        ...record.payment,
        status:
          refund.status === 'simulated'
            ? 'demo_refunded'
            : refund.status === 'processed'
              ? 'refunded'
              : refund.status === 'manual_review'
                ? 'refund_attention'
                : 'refund_pending',
        refund: record.refund,
      };
      record.pass = {
        ...record.pass,
        bookingStatus: 'cancelled',
        cancellationPending: false,
        paymentStatus: record.payment.status,
      };
      const trip = await this.repo.lockTrip(
        {
          boatId: record.boat.id,
          ...record.trip,
        },
        session,
      );
      for (const [seat, value] of Object.entries(trip.occupied || {}))
        if (value.bookingId === id) delete trip.occupied[seat];
      await this.c('inventory').updateOne(
        {
          _id: trip._id,
        },
        {
          $set: {
            occupied: trip.occupied,
          },
        },
        {
          session,
        },
      );
      await this.c('bookings').updateOne(
        {
          _id: id,
        },
        {
          $set: {
            status: record.status,
            cancellation: record.cancellation,
            refund: record.refund,
            payment: record.payment,
            pass: record.pass,
          },
        },
        {
          session,
        },
      );
      for (const name of ['outbox', 'sms_outbox'])
        await this.c(name).updateMany(
          {
            bookingId: id,
            kind: {
              $ne: 'notice',
            },
            status: {
              $in: ['pending', 'failed'],
            },
          },
          {
            $set: {
              status: 'suppressed',
            },
          },
          {
            session,
          },
        );
      await this.audit('booking_cancelled', 'admin:' + admin, id, session, {
        reason: text,
      });
      await bookingNotice(this.repo, record, 'cancel-approved', 'Booking cancelled', session);
      return cancellationInfo(record);
    });
  }
  async refundUnbooked(id, admin, input) {
    const notes = reason(input?.reason);
    return this.repo.transaction(async (session) => {
      const payment = await this.c('payments').findOne(
        {
          _id: id,
        },
        {
          session,
        },
      );
      if (!payment) throw new ApiError(404, 'Payment not found.');
      const existing = await this.c('refunds').findOne(
        {
          paymentRecordId: id,
        },
        {
          session,
        },
      );
      if (existing)
        return refundView({
          ...existing,
          id: existing._id,
        });
      if (payment.bookingId || payment.status !== 'refund_required' || !payment.paymentId)
        throw new ApiError(409, 'This payment is not eligible for an unbooked refund.');
      const hold = await this.repo.lockTrip(payment.payload, session);
      for (const [seat, value] of Object.entries(hold.occupied || {}))
        if (value.attemptId === payment._id) delete hold.occupied[seat];
      await this.c('inventory').updateOne(
        {
          _id: hold._id,
        },
        {
          $set: {
            occupied: hold.occupied,
          },
        },
        {
          session,
        },
      );
      const refund = await this.createRefund(
        {
          ...payment,
          verification: 'provider_verified',
          provider: 'Razorpay',
        },
        null,
        'admin:' + admin,
        session,
      );
      await this.audit('unbooked_refund_approved', 'admin:' + admin, refund._id, session, {
        reason: notes,
      });
      await enqueueNotice(
        this.repo,
        {
          id: 'notice:' + refund._id + ':approved',
          notice: {
            event: 'refund_approved',
            heading: 'Refund approved',
            body: 'Check My account for refund status. No journey was confirmed for this payment.',
            reference: refund._id,
            language: payment.payload?.language,
            fields: [['Refund amount', String(refund.amount / 100) + ' INR']],
          },
          recipients: [
            {
              audience: 'customer',
              email: payment.payload?.email,
              phone: payment.payload?.phone,
            },
            {
              audience: 'admin',
            },
          ],
        },
        session,
      );
      return refundView({
        ...refund,
        id: refund._id,
      });
    });
  }
  async auditForRefund(id) {
    const row = await this.c('refunds').findOne({
      _id: id,
    });
    if (!row) throw new ApiError(404, 'Refund not found.');
    return {
      audit: await this.c('financial_audit')
        .find(
          {
            reference: {
              $in: [id, ...(row.bookingId ? [row.bookingId] : [])],
            },
          },
          {
            projection: {
              _id: 0,
              action: 1,
              actor: 1,
              reference: 1,
              at: 1,
              reason: 1,
              amount: 1,
              generation: 1,
              providerRefundId: 1,
            },
          },
        )
        .sort({
          at: -1,
          _id: -1,
        })
        .limit(200)
        .toArray(),
    };
  }
  async listRefunds(query = {}) {
    const offset = Math.max(0, Math.min(100000, parseInt(query.offset) || 0));
    return this.repo.transaction(async (session) => ({
      refunds: (
        await this.c('refunds')
          .find(
            {},
            {
              session,
            },
          )
          .sort({
            createdAt: -1,
            _id: 1,
          })
          .skip(offset)
          .limit(50)
          .toArray()
      ).map((row) => ({
        ...refundView({
          ...row,
          id: row._id,
        }),
        bookingId: row.bookingId,
        paymentRecordId: row.paymentRecordId,
        attention: ['unknown', 'failed', 'manual_review'].includes(row.status),
      })),
      total: await this.c('refunds').countDocuments(
        {},
        {
          session,
        },
      ),
      offset,
      limit: 50,
    }));
  }
}
