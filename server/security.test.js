/** @file Regression tests for security behavior using isolated fixtures. */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { base32, totp, matchingStep, secretBox } from './security/totp.js';
import { operationsWebhook } from './operations/webhook.js';
import { independentAlerts, operationsWorker } from './operations/worker.js';
test('authenticator codes match RFC vectors and reject consumed counters', () => {
  const secret = base32(Buffer.from('12345678901234567890'));
  assert.equal(totp(secret, 1, 8), '94287082');
  assert.equal(totp(secret, 1), '287082');
  assert.equal(matchingStep(secret, '287082', 59000), 1);
  assert.equal(matchingStep(secret, '287082', 59000, 1), null);
  assert.equal(matchingStep(secret, 'bad', 59000), null);
});
test('encrypted authenticator secrets require the correct key and account binding', () => {
  const box = secretBox('0123456789abcdef'.repeat(4)),
    encrypted = box.seal('PRIVATE_TOTP_SECRET', 'admin');
  assert.ok(!JSON.stringify(encrypted).includes('PRIVATE_TOTP_SECRET'));
  assert.equal(box.open(encrypted, 'admin'), 'PRIVATE_TOTP_SECRET');
  assert.throws(() => box.open(encrypted, 'another'), {
    status: 503,
  });
  assert.throws(() => secretBox('f'.repeat(64)).open(encrypted, 'admin'), {
    status: 503,
  });
  assert.throws(() => secretBox('').seal('test', 'admin'), {
    status: 503,
  });
});
test('operations webhook uses an idempotency key, sanitized data and HTTPS without redirects', async () => {
  const calls = [],
    webhook = operationsWebhook(
      {
        OPERATIONS_WEBHOOK_URL: 'https://monitor.example.test/events',
        OPERATIONS_WEBHOOK_KEY: 'a-private-key-that-is-at-least-32-characters',
      },
      async (url, options) => {
        calls.push({
          url,
          options,
        });
        return Response.json({
          ok: true,
        });
      },
    );
  assert.equal(webhook.enabled, true);
  await webhook.send(
    {
      code: 'database',
      state: 'open',
    },
    'event-key',
  );
  assert.equal(calls[0].options.redirect, 'error');
  assert.equal(calls[0].options.headers['Idempotency-Key'], 'event-key');
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    code: 'database',
    state: 'open',
  });
  assert.equal(
    operationsWebhook({
      OPERATIONS_WEBHOOK_URL: 'http://insecure.test',
    }).enabled,
    false,
  );
});
test('a database outage alerts outside MongoDB, is throttled and records recovery when storage returns', async () => {
  let healthy = false,
    time = 2000000;
  const sends = [],
    observed = [];
  const repo = {
    async health() {
      if (!healthy) throw new Error('PRIVATE_DATABASE_URI');
    },
    ops: {
      instance: 'app-test',
      async observe(...args) {
        observed.push(args);
      },
      async scan() {},
      async deliver() {},
    },
  };
  const worker = operationsWorker({
    repo,
    now: () => time,
    sender: {
      async send(event, id) {
        sends.push({
          event,
          id,
        });
      },
    },
  });
  const old = console.error;
  console.error = () => {};
  try {
    await worker.kick();
    await worker.kick();
    assert.equal(sends.length, 1);
    assert.ok(!JSON.stringify(sends).includes('PRIVATE_'));
    time += 900001;
    await worker.kick();
    assert.equal(sends.length, 2);
    healthy = true;
    await worker.kick();
    assert.ok(observed.some((args) => args[1] === 'database' && args[2] === 0));
  } finally {
    console.error = old;
    await worker.stop();
  }
});
test('independent incident email does not need a database and excludes connection errors', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ops-test-'));
  const messages = [],
    sender = independentAlerts({
      throttleDirectory: directory,
      config: {
        configured: true,
        user: 'sender@example.test',
        adminTo: 'admin@example.test',
      },
      transport: {
        async sendMail(message) {
          messages.push(message);
          return {
            accepted: ['admin@example.test'],
          };
        },
      },
    });
  try {
    assert.equal(
      await sender.send(
        {
          incidentId: 'database:app-test',
          code: 'database',
          state: 'open',
        },
        'event-1',
      ),
      true,
    );
    assert.equal(messages.length, 1);
    assert.equal(messages[0].to.address, 'admin@example.test');
    assert.ok(!messages[0].text.includes('mongodb'));
  } finally {
    sender.close();
    await rm(directory, {
      recursive: true,
      force: true,
    });
  }
});
test('database-outage email attempts are deduplicated across process-local sender instances', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ops-throttle-test-'));
  let sent = 0;
  const options = {
    throttleDirectory: directory,
    config: {
      configured: true,
      user: 'sender@example.test',
      adminTo: 'admin@example.test',
    },
    transport: {
      async sendMail() {
        sent++;
        return {
          accepted: ['admin@example.test'],
        };
      },
    },
  };
  const first = independentAlerts(options),
    second = independentAlerts(options);
  try {
    await Promise.all([
      first.send(
        {
          incidentId: 'database:app',
          state: 'open',
        },
        'same-incident-bucket',
      ),
      second.send(
        {
          incidentId: 'database:app',
          state: 'open',
        },
        'same-incident-bucket',
      ),
    ]);
    assert.equal(sent, 1);
  } finally {
    first.close();
    second.close();
    await rm(directory, {
      recursive: true,
      force: true,
    });
  }
});
