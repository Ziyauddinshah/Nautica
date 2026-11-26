/** @file Regression tests for payment-record behavior using isolated fixtures. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bookingPaymentFields, safeCheckoutPayload } from './domain/payment-record.js';
test('booking payment records store useful summaries without payment credentials or contact duplication', () => {
  const fields = bookingPaymentFields({
    id: 'booking-1',
    userId: 'owner',
    createdAt: '2026-11-21T00:00:00Z',
    boat: { id: 'b1', name: 'Boat', pier: 'Assi Ghat' },
    trip: { date: '2026-11-22', slot: 'Sunrise', guests: 1, seats: ['01'] },
    payment: {
      status: 'demo_paid',
      amount: 126000,
      method: 'VISA · 4242',
      network: 'VISA',
      last4: '4242',
      number: 'PRIVATE_PAN',
      cvv: 'PRIVATE_CVV',
      upi: 'PRIVATE_UPI',
      password: 'PRIVATE_SECRET',
    },
    customer: { email: 'PRIVATE_EMAIL' },
  });
  assert.equal(fields.bookingId, 'booking-1');
  assert.equal(fields.amount, 126000);
  assert.equal(fields.currency, 'INR');
  assert.equal(fields.verification, 'demo');
  assert.equal(fields.summary.last4, '4242');
  assert.ok(!JSON.stringify(fields).includes('PRIVATE_'));
  assert.throws(() => bookingPaymentFields({ payment: { amount: -1 } }), /amount/);
});
test('checkout payloads allow only fields required for booking; unexpected payment credentials are discarded', () => {
  const payload = safeCheckoutPayload(
    {
      boatId: 'b1',
      name: 'Guest',
      phone: '+919876543210',
      cardNumber: 'PRIVATE_PAN',
      cvv: 'PRIVATE_CVV',
      upi: 'PRIVATE_UPI',
      payment: { password: 'PRIVATE_SECRET' },
      email: 'spoof@example.test',
    },
    'owner@example.test',
  );
  assert.equal(payload.email, 'owner@example.test');
  assert.equal(payload.boatId, 'b1');
  assert.ok(!JSON.stringify(payload).includes('PRIVATE_'));
  assert.ok(!JSON.stringify(payload).includes('spoof'));
});
