/** @file Trip, boat, seat and price rules shared by this layer. */
import { randomUUID } from 'node:crypto';
import * as N from '../../src/domain/booking.js';
import { ApiError, digest } from '../errors.js';
const bankNames = [
  'SBI',
  'HDFC Bank',
  'ICICI Bank',
  'Axis Bank',
  'Bank of Baroda',
  'Canara Bank',
  'Kotak Mahindra',
  'Punjab National Bank',
  'Union Bank',
];
export function tripInfo(input, catalog = N.boats) {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new ApiError(400, 'Invalid trip request.');
  const boat = catalog.find((boat) => boat.id === input.boatId);
  if (
    !boat ||
    !N.slots.includes(input.slot) ||
    typeof input.date !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(input.date)
  )
    throw new ApiError(400, 'Choose a valid boat, date and time slot.');
  const parsed = new Date(`${input.date}T12:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== input.date)
    throw new ApiError(400, 'Invalid calendar date.');
  return boat;
}
function paymentSummary(payment) {
  if (!payment || typeof payment !== 'object')
    throw new ApiError(400, 'Choose a supported payment method.');
  if (payment.type === 'upi' && ['GPay', 'PhonePe', 'Paytm', 'BHIM'].includes(payment.provider))
    return { type: 'upi', provider: payment.provider, method: `UPI · ${payment.provider}` };
  if (payment.type === 'bank' && bankNames.includes(payment.bank))
    return { type: 'bank', bank: payment.bank, method: `Net banking · ${payment.bank}` };
  if (
    payment.type === 'card' &&
    ['VISA', 'MASTERCARD', 'RUPAY', 'AMEX', 'CARD'].includes(payment.network) &&
    /^\d{4}$/.test(payment.last4)
  )
    return {
      type: 'card',
      network: payment.network,
      last4: payment.last4,
      method: `${payment.network} · ${payment.last4}`,
    };
  throw new ApiError(400, 'Choose a supported payment method.');
}
export function validateBooking(input, owner = null, catalog = N.boats) {
  const boat = tripInfo(input, catalog);
  if (input.date < N.localDate()) throw new ApiError(400, 'Choose today or a future date.');
  if (!N.validSeats(boat, input.seats, input.guests))
    throw new ApiError(400, 'Choose one valid, distinct seat for every guest.');
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
  const phone = typeof input.phone === 'string' ? input.phone.trim() : '';
  if (
    name.length < 2 ||
    name.length > 80 ||
    email.length > 150 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    !/^\+?[\d ()-]{7,25}$/.test(phone) ||
    phone.replace(/\D/g, '').length < 7 ||
    phone.replace(/\D/g, '').length > 15
  )
    throw new ApiError(400, 'Enter a valid passenger name, email and phone number.');
  if (
    !Array.isArray(input.extras) ||
    input.extras.some((id) => !N.extras.some((extra) => extra.id === id))
  )
    throw new ApiError(400, 'Invalid trip extras.');
  if (typeof input.requestKey !== 'string' || !/^[a-zA-Z0-9-]{16,80}$/.test(input.requestKey))
    throw new ApiError(400, 'Missing booking request key.');
  const extras = [...new Set(['safety', ...input.extras])].sort();
  const seats = [...input.seats].sort();
  const payment = paymentSummary(input.payment);
  const canonical = {
    boatId: boat.id,
    date: input.date,
    slot: input.slot,
    guests: input.guests,
    seats,
    name,
    email,
    phone,
    extras,
    payment,
    ownerId: owner?.id || null,
  };
  const hash = digest(JSON.stringify(canonical));
  return { boat, name, email, phone, extras, seats, payment, hash };
}
export function buildBookingRecord(
  input,
  mode = 'seats',
  owner = null,
  receipt = null,
  catalog = N.boats,
) {
  const { boat, name, email, phone, extras, seats, payment } = validateBooking(
    input,
    owner,
    catalog,
  );
  const id = `NTC-${randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase()}`;
  const createdAt = new Date().toISOString();
  const pricing = N.amounts(boat, extras);
  const paymentInfo = {
    ...payment,
    ...(receipt
      ? {
          type: (receipt.provider || 'Razorpay').toLowerCase(),
          provider: receipt.provider || 'Razorpay',
          method: receipt.provider || 'Razorpay',
        }
      : {}),
    status: receipt ? 'paid' : 'demo_paid',
    reference: receipt?.paymentId || `DEMO-${randomUUID()}`,
    paidAt: createdAt,
    amount: pricing.total,
    currency: 'INR',
  };
  const pass = {
    id,
    boatId: boat.id,
    boat: { ...boat },
    date: input.date,
    slot: input.slot,
    guests: input.guests,
    seats,
    name,
    extras,
    total: pricing.total,
    currencyBase: 'INR',
    method: paymentInfo.method,
    paymentStatus: paymentInfo.status,
    paymentReference: paymentInfo.reference,
    createdAt,
    serverConfirmed: true,
    emailStatus: 'requested',
  };
  const record = {
    language: input.language === 'hi' ? 'hi' : 'en',
    id,
    status: 'confirmed',
    createdAt,
    bookingMode: mode,
    customer: { name, email, phone },
    boat: { ...boat },
    trip: { date: input.date, slot: input.slot, guests: input.guests, seats },
    extras,
    pricing,
    payment: paymentInfo,
    pass,
  };
  return record;
}
