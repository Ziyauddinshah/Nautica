/** @file Regression tests for aftercare behavior using isolated fixtures. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { cancellationInfo, cancellationPolicy } from './aftercare/policy.js';
import { documentStage, reminderDate } from './aftercare/reminders.js';
import { noticeMessage, noticeSms } from './aftercare/notices.js';
import { createRazorpayGateway } from './services/razorpay.js';
import { slots } from '../src/domain/booking.js';
test('24-hour cancellation boundary uses boarding-pier time and preserves a booking policy snapshot', () => {
  assert.equal(cancellationPolicy({}).cutoffHours, 24);
  const record = {
    status: 'confirmed',
    boat: {
      pier: 'Assi Ghat',
    },
    trip: {
      date: '2027-01-01',
      slot: slots[0],
    },
  };
  assert.equal(cancellationInfo(record, new Date('2026-12-31T00:00:00Z')).canRequest, true);
  assert.equal(cancellationInfo(record, new Date('2026-12-31T00:00:00.001Z')).canRequest, false);
  assert.equal(
    cancellationInfo(
      {
        ...record,
        cancellationPolicy: {
          version: 'old',
          cutoffHours: 0,
        },
      },
      new Date('2026-12-31T01:00:00Z'),
    ).canRequest,
    true,
  );
  assert.equal(
    cancellationInfo(
      {
        ...record,
        status: 'cancelled',
      },
      new Date('2026-12-30'),
    ).canRequest,
    false,
  );
});
test('document reminder milestones catch up missed runs, reject invalid dates and use India dates', () => {
  assert.equal(reminderDate(new Date('2026-11-25T20:00:00Z')), '2026-11-26');
  const today = '2026-12-01';
  for (const [expiry, stage] of [
    ['2027-01-01', null],
    ['2026-12-31', '30'],
    ['2026-12-15', '14'],
    ['2026-12-08', '7'],
    ['2026-12-02', '1'],
    ['2026-12-01', 'today'],
    ['2026-11-30', 'expired'],
  ])
    assert.equal(documentStage(expiry, today)?.stage || null, stage);
  assert.equal(documentStage(null, today), null);
  assert.equal(documentStage('2025-02-30', today), null);
});
test('refund provider calls use stable idempotency, authenticated readbacks and signed webhook verification', async () => {
  const calls = [],
    gateway = createRazorpayGateway({
      keyId: 'key',
      keySecret: 'secret',
      webhookSecret: 'webhook',
      transport: async (url, options) => {
        calls.push({
          url,
          options,
        });
        return Response.json({
          id: 'rfnd_TEST',
          status: 'pending',
        });
      },
    }),
    body = {
      amount: 126000,
      speed: 'normal',
      receipt: 'RF-stable-key-1',
      notes: {
        nautica_refund_id: 'RF-stable-key',
      },
    };
  await gateway.createRefund('pay_TEST', body, 'RF-stable-key-1');
  assert.equal(calls[0].options.headers['X-Refund-Idempotency'], 'RF-stable-key-1');
  assert.deepEqual(JSON.parse(calls[0].options.body), body);
  assert.equal(calls[0].url, 'https://api.razorpay.com/v1/payments/pay_TEST/refund');
  await gateway.getRefund('pay_TEST', 'rfnd_TEST');
  assert.equal(calls[1].url, 'https://api.razorpay.com/v1/payments/pay_TEST/refunds/rfnd_TEST');
  assert.equal(calls[1].options.method, 'GET');
  const raw = JSON.stringify({
      event: 'refund.processed',
      payload: {
        refund: {
          entity: {
            id: 'rfnd_TEST',
          },
        },
      },
    }),
    signature = createHmac('sha256', 'webhook').update(raw).digest('hex');
  assert.deepEqual(gateway.readWebhook(raw, signature), {
    type: 'refund',
    refundId: 'rfnd_TEST',
  });
  assert.throws(() => gateway.readWebhook(raw, 'wrong'), {
    status: 400,
  });
});
test('notice emails escape boat details; SMS contains no document numbers or financial credentials', () => {
  const notice = {
    reference: 'BT-TEST',
    heading: 'Boat document validity reminder',
    body: 'Renew document',
    fields: [
      ['Vessel', '<script>alert(1)</script>'],
      ['Document', 'Insurance'],
      ['Expiry date', '2027-01-01'],
    ],
  };
  const message = noticeMessage(
    notice,
    {
      user: 'sender@example.test',
    },
    'owner@example.test',
    '<notice@example.test>',
  );
  assert.ok(!message.html.includes('<script>'));
  assert.ok(message.html.includes('&lt;script&gt;'));
  assert.ok(!noticeSms(notice).includes('<script>'));
  assert.equal(message.disableFileAccess, true);
});
test('aftercare worker shares an in-flight run and stops before starting more work', async () => {
  const { aftercareWorker } = await import('./aftercare/worker.js');
  let release,
    count = 0,
    reminders = 0;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const worker = aftercareWorker({
    refunds: {
      async drain({ shouldStop }) {
        count++;
        await gate;
        assert.equal(shouldStop(), true);
      },
    },
    reminders: {
      async run() {
        reminders++;
      },
    },
  });
  const first = worker.kick(),
    second = worker.kick();
  assert.equal(first, second);
  const stopping = worker.stop();
  release();
  await stopping;
  assert.equal(count, 1);
  assert.equal(reminders, 0);
  assert.deepEqual(await first, {
    ok: true,
  });
});
