/** @file Browser helper for sms status; keep private server settings out of this module. */
export const smsStatusText = (status) =>
  ({
    pending: 'Queued',
    sending: 'Submitting',
    accepted: 'Accepted by gateway',
    dispatched: 'Dispatched',
    sent: 'Sent (delivery unconfirmed)',
    delivered: 'Delivered',
    failed: 'Failed',
    unknown: 'Outcome unknown',
    delivery_unknown: 'Delivery unconfirmed',
  })[status] || 'Status unavailable';
