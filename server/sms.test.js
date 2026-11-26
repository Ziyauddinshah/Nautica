/** @file Regression tests for sms behavior using isolated fixtures. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { textbeeConfig, smsPhone, createTextbeeGateway } from './services/textbee.js';
import { bookingSms } from './domain/sms.js';
const deviceId = 'a'.repeat(24),
  batchId = 'b'.repeat(24),
  apiKey = 'PRIVATE_API_KEY',
  config = textbeeConfig({
    SMS_ENABLED: 'true',
    TEXTBEE_API_KEY: apiKey,
    TEXTBEE_DEVICE_ID: deviceId,
    SMS_ADMIN_TO: '+919876543210',
  });
test('TextBee configuration and phone normalization keep secrets server-side and avoid guessing international destinations', () => {
  assert.equal(config.configured, true);
  assert.equal(textbeeConfig({}).configured, false);
  assert.equal(
    textbeeConfig({ SMS_ENABLED: 'true', TEXTBEE_API_KEY: apiKey, TEXTBEE_DEVICE_ID: 'bad/id' })
      .configured,
    false,
  );
  assert.equal(smsPhone('98765 43210'), '+919876543210');
  assert.equal(smsPhone('+1 (202) 555-0123'), '+12025550123');
  assert.equal(smsPhone('2025550123', '1'), null);
  assert.equal(smsPhone('55555'), null);
  assert.equal(smsPhone('abc+919876543210'), null);
});
test('TextBee send uses the current official endpoint, selected device and private header; accepted is not delivered', async () => {
  let call;
  const gateway = createTextbeeGateway({
    config,
    transport: async (url, options) => {
      call = { url, options };
      return Response.json({ data: { success: true, smsBatchId: batchId, recipientCount: 1 } });
    },
  });
  assert.deepEqual(await gateway.send('+919876543210', 'booking'), { batchId });
  assert.equal(call.url, 'https://api.textbee.dev/api/v1/gateway/send-sms');
  assert.equal(call.options.headers['x-api-key'], apiKey);
  assert.equal(call.options.redirect, 'error');
  assert.deepEqual(JSON.parse(call.options.body), {
    recipients: ['+919876543210'],
    message: 'booking',
    deviceId,
  });
});
test('timeouts and malformed send acknowledgements are unknown; only a definite rate-limit rejection is automatically retryable', async () => {
  for (const [transport, unknown, retryable] of [
    [
      async () => {
        throw new Error('PRIVATE_SECRET');
      },
      true,
      false,
    ],
    [async () => Response.json({ data: {} }, { status: 200 }), true, false],
    [async () => new Response('PRIVATE_SECRET', { status: 429 }), false, true],
    [async () => new Response('PRIVATE_SECRET', { status: 401 }), false, false],
  ]) {
    const gateway = createTextbeeGateway({ config, transport });
    await assert.rejects(gateway.send('+919876543210', 'booking'), (error) => {
      assert.equal(error.unknown, unknown);
      assert.equal(error.retryable, retryable);
      assert.ok(!error.message.includes('PRIVATE'));
      return true;
    });
  }
});
test('delivery polling checks the batch and exact recipient before accepting a delivered status', async () => {
  const gateway = createTextbeeGateway({
    config,
    transport: async () =>
      Response.json({
        data: {
          batch: { _id: batchId },
          messages: [
            { recipient: '+12025550123', status: 'delivered' },
            { recipient: '+919876543210', status: 'sent' },
          ],
        },
      }),
  });
  assert.deepEqual(await gateway.status(batchId, '+919876543210'), { status: 'sent' });
  assert.deepEqual(await gateway.status(batchId, '+919999999999'), { status: 'unknown' });
});
test('bilingual booking SMS omits account/contact/payment credentials and labels simulated payments', () => {
  const booking = {
    id: 'NTC-123456ABCDEF',
    language: 'en',
    customer: { name: 'PRIVATE_NAME', email: 'PRIVATE_EMAIL', phone: 'PRIVATE_PHONE' },
    boat: { name: 'Ganges Dawn', pier: 'Assi Ghat' },
    trip: { date: '2026-12-01', slot: 'Sunrise · 5:30 AM', seats: ['01', '02'] },
    payment: { amount: 126000, status: 'demo_paid', reference: 'PRIVATE_PAYMENT' },
  };
  const message = bookingSms(booking, 'customer');
  assert.ok(message.includes('DEMO'));
  assert.ok(message.includes('01,02'));
  assert.ok(message.includes('1260.00'));
  assert.ok(!message.includes('PRIVATE_'));
  assert.ok(!message.includes('·'));
  assert.ok(bookingSms({ ...booking, language: 'hi' }, 'admin').includes('डेमो'));
  assert.ok(
    bookingSms({ ...booking, payment: { amount: 126000, status: 'paid' } }, 'customer').includes(
      'Payment received',
    ),
  );
});
