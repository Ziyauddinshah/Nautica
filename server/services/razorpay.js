/** @file Razorpay gateway adapter: signatures, authoritative evidence and sanitized provider health. */
import { ApiError } from '../errors.js';
import { validSignature } from '../domain/signature.js';
export function createRazorpayGateway({
  keyId,
  keySecret,
  webhookSecret,
  transport = fetch,
  onHealth = () => {},
} = {}) {
  const report = (value) => {
    try {
      Promise.resolve(onHealth(value)).catch(() => {});
    } catch {}
  };
  const enabled = Boolean(keyId && keySecret && webhookSecret);
  async function request(path, body, extraHeaders = {}) {
    let response;
    try {
      response = await transport('https://api.razorpay.com/v1/' + path, {
        method: body ? 'POST' : 'GET',
        redirect: 'error',
        headers: {
          Authorization: 'Basic ' + Buffer.from(keyId + ':' + keySecret).toString('base64'),
          'Content-Type': 'application/json',
          ...extraHeaders,
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(12000),
      });
    } catch {
      report(false);
      throw new ApiError(503, 'Payment service is unavailable. Please try again.');
    }
    report(response.status < 500 && ![401, 403, 429].includes(response.status));
    if (!response.ok) {
      const error = new ApiError(503, 'Payment service is unavailable. Please try again.');
      if (body && path.endsWith('/refund') && [400, 401, 403, 404].includes(response.status))
        error.refundRejected = true;
      throw error;
    }
    try {
      return await response.json();
    } catch {
      report(false);
      throw new ApiError(503, 'Payment service is unavailable. Please try again.');
    }
  }
  function readWebhook(raw, signature) {
    if (!enabled || !validSignature(signature, raw, webhookSecret))
      throw new ApiError(400, 'Invalid payment notification.');
    let event;
    try {
      event = JSON.parse(raw);
    } catch {
      throw new ApiError(400, 'Invalid payment notification.');
    }
    if (!event || typeof event !== 'object' || Array.isArray(event))
      throw new ApiError(400, 'Invalid payment notification.');
    if (['refund.created', 'refund.processed', 'refund.failed'].includes(event.event)) {
      const refundId = event.payload?.refund?.entity?.id;
      return typeof refundId === 'string' ? { type: 'refund', refundId } : null;
    }
    if (event.event === 'payment.failed') {
      const payment = event.payload?.payment?.entity;
      return typeof payment?.id === 'string' && typeof payment?.order_id === 'string'
        ? { type: 'payment_failed', paymentId: payment.id, orderId: payment.order_id }
        : null;
    }
    if (!['payment.captured', 'order.paid'].includes(event.event)) return null;
    const payment = event.payload?.payment?.entity;
    if (typeof payment?.id !== 'string' || typeof payment?.order_id !== 'string') return null;
    return {
      paymentId: payment.id,
      orderId: payment.order_id,
      attemptId: typeof payment.notes?.attempt_id === 'string' ? payment.notes.attempt_id : null,
    };
  }
  return {
    name: 'Razorpay',
    enabled,
    keyId,
    createOrder: (body) => request('orders', body),
    getPayment: async (id) => {
      const payment = await request('payments/' + encodeURIComponent(id));
      return {
        id: payment.id,
        orderId: payment.order_id,
        amount: payment.amount,
        currency: payment.currency,
        status: payment.status,
        amountRefunded: payment.amount_refunded,
      };
    },
    createRefund: (id, body, key) =>
      request('payments/' + encodeURIComponent(id) + '/refund', body, {
        'X-Refund-Idempotency': key,
      }),
    getRefund: (paymentId, id) =>
      request('payments/' + encodeURIComponent(paymentId) + '/refunds/' + encodeURIComponent(id)),
    fetchRefund: (id) => request('refunds/' + encodeURIComponent(id)),
    listRefunds: (id, skip = 0) =>
      request('payments/' + encodeURIComponent(id) + '/refunds?count=100&skip=' + skip),
    verifyCallback: (orderId, paymentId, signature) =>
      validSignature(signature, orderId + '|' + paymentId, keySecret),
    readWebhook,
  };
}
