/** @file Pure validation and public data rules for payment record. */
// An explicit allowlist: never persist card numbers, CVVs, UPI IDs or gateway secrets.
export function bookingPaymentFields(booking, { providerVerified = false } = {}) {
  const payment = booking.payment || {},
    amount = payment.amount ?? booking.pricing?.total ?? booking.pass?.total;
  if (!Number.isSafeInteger(amount) || amount < 0)
    throw new Error('Booking has no valid payment amount; reconciliation is required.');
  const summary = {};
  for (const key of ['type', 'network', 'last4', 'bank'])
    if (typeof payment[key] === 'string') summary[key] = payment[key];
  if (summary.last4 && !/^\d{4}$/.test(summary.last4)) delete summary.last4;
  return {
    kind: 'booking_payment',
    recordVersion: 1,
    bookingId: booking.id,
    userId: booking.userId || null,
    amount,
    currency: 'INR',
    status: payment.status || 'unknown',
    method: payment.method || booking.pass?.method || 'Status unavailable',
    provider: payment.provider || (payment.status === 'demo_paid' ? 'Simulation' : 'Historical'),
    reference: payment.reference || null,
    paidAt: payment.paidAt || null,
    createdAt: booking.createdAt,
    updatedAt: new Date().toISOString(),
    verification: providerVerified
      ? 'provider_verified'
      : payment.status === 'demo_paid'
        ? 'demo'
        : 'historical_record',
    boat: { id: booking.boat.id, name: booking.boat.name, pier: booking.boat.pier },
    trip: {
      date: booking.trip.date,
      slot: booking.trip.slot,
      guests: booking.trip.guests,
      seats: [...booking.trip.seats],
    },
    summary,
  };
}
export function safeCheckoutPayload(input, email) {
  const result = {};
  for (const key of [
    'boatId',
    'date',
    'slot',
    'guests',
    'seats',
    'name',
    'phone',
    'extras',
    'requestKey',
    'language',
  ])
    if (input[key] !== undefined) result[key] = input[key];
  return { ...result, email, payment: { type: 'upi', provider: 'GPay' } };
}
