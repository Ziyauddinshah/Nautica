/** @file Provider-neutral checkout and capture coordination outside retryable database transactions. */
import { ApiError } from '../errors.js';
// Storage and gateway are independent injected ports. Neither HTTP nor the gateway
// performs database queries, and external provider calls never run inside a transaction.
export function createPaymentService(store, gateway, { mode = 'seats', refunds = null } = {}) {
  const publicOrder = (row) => ({
    attemptId: row._id,
    orderId: row.orderId,
    keyId: gateway.keyId,
    amount: row.amount,
    currency: 'INR',
    expires: row.expires,
    serverNow: Date.now(),
  });
  async function order(input, user) {
    if (!gateway.enabled) throw new ApiError(503, 'Online booking is currently unavailable.');
    const { row, existing } = await store.reserve(input, user, mode);
    if (existing) return publicOrder(row);
    let remote;
    try {
      remote = await gateway.createOrder({
        amount: row.amount,
        currency: 'INR',
        receipt: row._id,
        notes: { attempt_id: row._id },
      });
    } catch (error) {
      await store.creationUnknown(row._id);
      throw error;
    }
    if (typeof remote.id !== 'string' || remote.amount !== row.amount || remote.currency !== 'INR')
      throw new ApiError(503, 'Payment service is unavailable. Please try again.');
    return publicOrder(await store.attachOrder(row._id, remote.id));
  }
  // A callback identifies the attempt; only authoritative provider evidence can confirm money received.
  async function settle(row, paymentId) {
    if (row.bookingId || row.status === 'paid') {
      if (row.paymentId !== paymentId)
        throw new ApiError(409, 'Payment is awaiting reconciliation.');
      return store.confirm(row, paymentId, mode, gateway.name);
    }
    const captured = await gateway.getPayment(paymentId);
    if (
      captured.id !== paymentId ||
      captured.orderId !== row.orderId ||
      captured.amount !== row.amount ||
      captured.currency !== 'INR' ||
      captured.status !== 'captured'
    )
      throw new ApiError(
        409,
        'Payment is awaiting confirmation. Check your booking history before retrying.',
      );
    return store.confirm(row, paymentId, mode, gateway.name);
  }
  async function verify(input, user) {
    if (!input || typeof input.paymentId !== 'string' || input.paymentId.length > 100)
      throw new ApiError(400, 'Payment verification failed.');
    const row = await store.owned(input.attemptId, user);
    if (
      row.orderId !== input.orderId ||
      !gateway.verifyCallback(row.orderId, input.paymentId, input.signature)
    )
      throw new ApiError(400, 'Payment verification failed.');
    return settle(row, input.paymentId);
  }
  async function webhook(raw, signature) {
    const event = gateway.readWebhook(raw, signature);
    if (!event) return;
    if (event.type === 'payment_failed') {
      const row = await store.findOrder(event.orderId);
      if (row) {
        const remote = await gateway.getPayment(event.paymentId);
        if (
          remote.status === 'failed' &&
          remote.id === event.paymentId &&
          remote.orderId === row.orderId &&
          remote.amount === row.amount &&
          remote.currency === 'INR'
        )
          await store.recordFailure?.(row, remote);
      }
      return;
    }
    if (event.type === 'refund') {
      if (refunds) await refunds.webhook(event.refundId);
      return;
    }
    let row = await store.findOrder(event.orderId);
    if (!row && event.attemptId) row = await store.recover(event.orderId, event.attemptId);
    if (!row) throw new ApiError(503, 'Payment is awaiting reconciliation.');
    try {
      await settle(row, event.paymentId);
    } catch (error) {
      if (
        ![
          'refund_required',
          'refund_pending',
          'refunded',
          'refund_failed',
          'refund_attention',
        ].includes((await store.get(row._id))?.status)
      )
        throw error;
    }
  }
  return { enabled: gateway.enabled, order, verify, webhook, attention: () => store.attention() };
}
