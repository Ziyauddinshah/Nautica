/** @file Regression tests for password reset behavior using isolated fixtures. */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { openStore } from './store.js';
import { createApp } from './app.js';
import { digest } from './store.js';
import {
  trustedResetOrigin,
  passwordResetMessage,
  emailConfig,
  createEmailService,
} from './email.js';
const resources = [];
after(() => {
  for (const close of resources.reverse()) close();
});
const account = {
  name: 'Reset Customer',
  email: 'reset@example.test',
  phone: '+919876543210',
  password: 'original-test-passphrase',
};
async function setup(enabled = true) {
  const db = openStore(':memory:'),
    jobs = [];
  const emailService = {
    status: () => ({ passwordResetEnabled: enabled, siteOrigin: 'https://nautica.example.test' }),
    sendPasswordReset: (job) => {
      jobs.push(job);
      return Promise.resolve(true);
    },
  };
  const server = createApp(db, { emailService });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  resources.push(() => {
    server.closeAllConnections();
    server.close();
    db.close();
  });
  const call = async (path, body, cookie, origin = base) => {
    const res = await fetch(base + path, {
      method: body ? 'POST' : 'GET',
      headers: {
        ...(body
          ? { 'Content-Type': 'application/json', 'X-Nautica-Request': '1', Origin: origin }
          : {}),
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return {
      status: res.status,
      data: await res.json(),
      cookie: res.headers.get('set-cookie')?.split(';')[0],
    };
  };
  const registered = await call('/api/user/register', account);
  return { db, jobs, call, registered };
}
test('known and unknown emails receive identical responses; only a hashed, expiring token is stored', async () => {
  const { db, jobs, call } = await setup();
  const known = await call('/api/user/forgot-password', { email: account.email }),
    unknown = await call('/api/user/forgot-password', { email: 'missing@example.test' });
  assert.equal(known.status, 200);
  assert.deepEqual(known.data, unknown.data);
  assert.equal(jobs.length, 1);
  assert.ok(!JSON.stringify(known.data).includes(jobs[0].token));
  const row = db.prepare('SELECT * FROM password_resets').get();
  assert.equal(row.token_hash, digest(jobs[0].token));
  assert.notEqual(row.token_hash, jobs[0].token);
  assert.ok(row.expires > Date.now());
  assert.ok(row.expires <= Date.now() + 900000);
  assert.equal(new URL(jobs[0].link).origin, 'https://nautica.example.test');
  assert.equal(new URL(jobs[0].link).search, '');
  assert.match(new URL(jobs[0].link).hash, /^#token=/);
});
test('reset works without a current password, signs out every device and prevents token reuse', async () => {
  const { call, jobs, registered } = await setup();
  const other = await call('/api/user/login', account);
  await call('/api/user/forgot-password', { email: account.email });
  const changed = await call('/api/user/reset-password', {
    token: jobs[0].token,
    newPassword: 'new-unique-test-passphrase',
  });
  assert.equal(changed.status, 200);
  assert.equal((await call('/api/user/session', null, registered.cookie)).status, 401);
  assert.equal((await call('/api/user/session', null, other.cookie)).status, 401);
  assert.equal((await call('/api/user/login', account)).status, 401);
  assert.equal(
    (
      await call('/api/user/login', {
        email: account.email,
        password: 'new-unique-test-passphrase',
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await call('/api/user/reset-password', {
        token: jobs[0].token,
        newPassword: 'another-new-passphrase',
      })
    ).status,
    400,
  );
});
test('expired, forged and weak-password reset attempts do not alter the account', async () => {
  const { db, jobs, call } = await setup();
  await call('/api/user/forgot-password', { email: account.email });
  assert.equal(
    (await call('/api/user/reset-password', { token: jobs[0].token, newPassword: 'short' })).status,
    400,
  );
  assert.equal(
    (
      await call('/api/user/reset-password', {
        token: 'f'.repeat(64),
        newPassword: 'another-test-passphrase',
      })
    ).status,
    400,
  );
  db.prepare('UPDATE password_resets SET expires=1').run();
  assert.equal(
    (
      await call('/api/user/reset-password', {
        token: jobs[0].token,
        newPassword: 'another-test-passphrase',
      })
    ).status,
    400,
  );
  assert.equal((await call('/api/user/login', account)).status, 200);
});
test('the first successful reset invalidates every outstanding link, including concurrent use', async () => {
  const { jobs, call } = await setup();
  await call('/api/user/forgot-password', { email: account.email });
  await call('/api/user/forgot-password', { email: account.email });
  const results = await Promise.all(
    jobs.map((job) =>
      call('/api/user/reset-password', {
        token: job.token,
        newPassword: 'new-unique-test-passphrase',
      }),
    ),
  );
  assert.deepEqual(results.map((result) => result.status).sort(), [200, 400]);
});
test('an authenticated password change invalidates pending reset links', async () => {
  const { call, jobs, registered } = await setup();
  await call('/api/user/forgot-password', { email: account.email });
  await call(
    '/api/user/password',
    { currentPassword: account.password, newPassword: 'changed-from-account-password' },
    registered.cookie,
  );
  assert.equal(
    (
      await call('/api/user/reset-password', {
        token: jobs[0].token,
        newPassword: 'reset-from-old-link-password',
      })
    ).status,
    400,
  );
});
test('forgot requests are throttled and cross-origin requests are denied', async () => {
  const { call } = await setup();
  assert.equal(
    (
      await call(
        '/api/user/forgot-password',
        { email: account.email },
        null,
        'https://evil.example',
      )
    ).status,
    403,
  );
  for (let i = 0; i < 3; i++)
    assert.equal((await call('/api/user/forgot-password', { email: account.email })).status, 200);
  assert.equal((await call('/api/user/forgot-password', { email: account.email })).status, 429);
});
test('disabled SMTP keeps the response generic and does not generate inaccessible reset tokens', async () => {
  const { call, db, jobs } = await setup(false);
  assert.equal((await call('/api/user/forgot-password', { email: account.email })).status, 200);
  assert.equal(jobs.length, 0);
  assert.equal(db.prepare('SELECT count(*) AS n FROM password_resets').get().n, 0);
});
test('trusted link origin rejects injected credentials, untrusted plaintext hosts and paths', () => {
  assert.equal(trustedResetOrigin('https://app.example.test'), 'https://app.example.test');
  assert.equal(trustedResetOrigin('http://localhost:3000'), 'http://localhost:3000');
  for (const input of [
    'http://evil.example',
    'javascript:alert(1)',
    'https://user:pass@app.example.test',
    'https://app.example.test/path',
    'https://app.example.test/?next=evil',
  ])
    assert.equal(trustedResetOrigin(input), null);
  assert.equal(trustedResetOrigin('http://localhost:3000', true), null);
});
test('password-reset email uses SMTP, escapes user content and never includes any password', async () => {
  const db = openStore(':memory:'),
    messages = [];
  const config = emailConfig({
    SMTP_ENABLED: 'true',
    SMTP_USER: 'sender@gmail.com',
    SMTP_PASS: 'not-real-test-password',
    SMTP_ADMIN_TO: 'admin@example.test',
    PUBLIC_ORIGIN: 'https://nautica.example.test',
  });
  const service = createEmailService(db, {
    config,
    transport: {
      sendMail: async (message) => {
        messages.push(message);
        return { accepted: [message.to.address] };
      },
    },
  });
  assert.equal(service.status().passwordResetEnabled, true);
  await service.sendPasswordReset({
    user: { name: '<script>alert(1)</script>', email: account.email },
    link: 'https://nautica.example.test/reset-password#token=abc',
  });
  assert.equal(messages.length, 1);
  assert.equal(messages[0].to.address, account.email);
  assert.match(messages[0].text, /15 minutes/);
  assert.match(messages[0].html, /&lt;script&gt;/);
  assert.ok(!messages[0].html.includes('<script>'));
  assert.ok(!JSON.stringify(messages).includes(account.password));
  await service.stop();
  db.close();
});
