export const refundStatusText = status => ({
  queued: 'Refund queued',
  sending: 'Refund submitting',
  unknown: 'Refund outcome unknown',
  pending: 'Refund processing',
  processed: 'Refund processed',
  failed: 'Refund failed',
  manual_review: 'Refund needs attention',
  simulated: 'Demo refund recorded'
})[status] || 'Status unavailable';
export const financialActionText = action => ({
  cancellation_withdrawn: 'Cancellation request withdrawn',
  cancellation_requested: 'Cancellation requested',
  cancellation_rejected: 'Cancellation declined',
  booking_cancelled: 'Booking cancelled',
  refund_approved: 'Refund approved',
  unbooked_refund_approved: 'Refund for unbooked payment approved',
  refund_pending: 'Refund processing',
  refund_processed: 'Refund processed',
  refund_failed: 'Refund failed',
  refund_unknown: 'Refund outcome unknown',
  refund_manual_review: 'Refund needs attention',
  refund_retry: 'Refund retry approved',
  refund_reconciled: 'Refund evidence checked'
})[action] || action;
