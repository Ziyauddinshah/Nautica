/** @file Cancellation cutoff policy and departure-time calculations. */
import { refundView } from '../domain/refund-view.js';
import { ApiError } from '../errors.js';
import { journeyEnd } from '../domain/history.js';
export function cancellationPolicy(env = process.env) {
  const hours = Number(String(env.CANCELLATION_CUTOFF_HOURS ?? '').trim() || 24);
  if (![0, 24].includes(hours)) throw new Error('CANCELLATION_CUTOFF_HOURS must be 0 or 24.');
  return {
    version: 'full-refund-v1',
    cutoffHours: hours,
    refundPercent: 100,
    approvalRequired: true,
  };
}
export function cancellationInfo(record, now = new Date()) {
  const saved = record.cancellationPolicy || cancellationPolicy(),
    policy = {
      version:
        typeof saved.version === 'string' && /^[a-zA-Z0-9-]{1,40}$/.test(saved.version)
          ? saved.version
          : 'full-refund-v1',
      cutoffHours: [0, 24].includes(saved.cutoffHours) ? saved.cutoffHours : 24,
      refundPercent: 100,
      approvalRequired: true,
    },
    end = journeyEnd(record),
    departure = end ? new Date(+end - 3600000) : null,
    deadline = departure ? new Date(+departure - policy.cutoffHours * 3600000) : null;
  const canRequest =
    record.status === 'confirmed' &&
    Boolean(deadline && now <= deadline) &&
    record.cancellation?.status !== 'requested';
  const amount = record.payment?.amount ?? record.pricing?.total ?? 0;
  const paid = ['paid', 'demo_paid'].includes(record.payment?.status);
  return {
    estimatedRefund: canRequest && paid && Number.isSafeInteger(amount) && amount >= 0 ? amount : 0,
    currency: 'INR',
    estimateOnly: true,
    policy,
    deadline: deadline?.toISOString() || null,
    canRequest:
      record.status === 'confirmed' &&
      Boolean(deadline && now <= deadline) &&
      record.cancellation?.status !== 'requested',
    status: record.cancellation?.status || null,
    revision: record.cancellation?.revision || 0,
    ...(record.cancellation
      ? {
          reason: record.cancellation.reason,
          requestedAt: record.cancellation.requestedAt,
          decisionReason: record.cancellation.decisionReason,
          decidedAt: record.cancellation.decidedAt,
        }
      : {}),
    refund: record.refund ? refundView(record.refund) : null,
  };
}
export { refundView } from '../domain/refund-view.js';
export function reason(value) {
  if (
    typeof value !== 'string' ||
    value.trim().length < 10 ||
    value.length > 1000 ||
    /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value)
  )
    throw new ApiError(400, 'Enter a reason between 10 and 1000 characters.');
  return value.trim();
}
