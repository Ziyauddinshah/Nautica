/** @file Public UI constants and presentation rules for operations. */
export const conditions = {
  admin_mfa_unavailable: {
    title: 'Admin authentication is unavailable',
    severity: 'critical',
    body: 'Restore the shared admin authentication configuration without disabling two-factor protection.',
  },
  admin_recovery: {
    title: 'An admin recovery code was used',
    severity: 'warning',
    body: 'Confirm the recovery sign-in was expected and review admin account security.',
  },
  payment_failures: {
    title: 'Repeated payment failures',
    severity: 'warning',
    body: 'Review payment provider health and recent failed attempts. A failed attempt is not a captured charge.',
  },
  payment_attention: {
    title: 'Payments require reconciliation',
    severity: 'critical',
    body: 'Review unbooked captured payments in Refund administration.',
  },
  refund_attention: {
    title: 'Refunds need operational review',
    severity: 'critical',
    body: 'Review failed, uncertain or manual-review refunds. Do not issue duplicate refunds.',
  },
  refund_stalled: {
    title: 'Refund processing is delayed',
    severity: 'warning',
    body: 'Review refunds that have remained pending for more than seven days.',
  },
  notification_failures: {
    title: 'Customer notifications are failing',
    severity: 'warning',
    body: 'Review email and SMS delivery status before retrying failed notifications.',
  },
  notification_backlog: {
    title: 'Notification delivery is delayed',
    severity: 'warning',
    body: 'Queued notifications have waited more than fifteen minutes. Check delivery services.',
  },
  admin_setup: {
    title: 'Admin two-factor setup is incomplete',
    severity: 'warning',
    body: 'Complete controlled two-factor enrollment for all admin accounts.',
  },
  admin_auth_failures: {
    title: 'Repeated admin authentication failures',
    severity: 'critical',
    body: 'Review admin access and recent authentication attempts.',
  },
  alert_delivery: {
    title: 'Operational alert delivery is failing',
    severity: 'critical',
    body: 'Check independent monitoring and alert delivery configuration.',
  },
  razorpay: {
    title: 'Payment provider is unavailable',
    severity: 'critical',
    body: 'Check payment provider availability and reconcile uncertain payment outcomes.',
  },
  identity: {
    title: 'Identity verification service is unavailable',
    severity: 'warning',
    body: 'Check the authorized identity verification service. Do not bypass owner verification.',
  },
  textbee: {
    title: 'SMS provider is unavailable',
    severity: 'warning',
    body: 'Check the SMS gateway and sender device. Accepted messages are not proof of delivery.',
  },
  smtp: {
    title: 'Email provider is unavailable',
    severity: 'warning',
    body: 'Check the email delivery service and durable notification queues.',
  },
  documents: {
    title: 'Document scanning is unavailable',
    severity: 'warning',
    body: 'Restore secure document scanning before accepting uploads.',
  },
  database: {
    title: 'Database is unreachable from an app instance',
    severity: 'critical',
    body: 'Check database quorum and connectivity. Bookings must remain unavailable without consistent storage.',
  },
  worker_stale: {
    title: 'An app instance has stopped reporting health',
    severity: 'critical',
    body: 'Check the missing app instance and background workers.',
  },
};
