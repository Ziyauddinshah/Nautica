/** @file Regression tests for privacy behavior using isolated fixtures. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openStore, setAdmin } from './store.js';
import { createApp } from './app.js';
import * as N from '../src/domain/booking.js';

test('customer/admin responses omit unexpected stored fields and server email settings', async () => {
  const db = openStore(':memory:');
  setAdmin(db, 'admin', 'test-admin-passphrase');
  const secret = 'SERVER_ONLY_CANARY_SECRET';
  const emailService = {
    status: () => ({
      configured: true,
      passwordResetEnabled: true,
      sender: 'smtp-private@example.test',
      adminRecipient: 'routing-private@example.test',
      siteOrigin: 'https://private-origin.example.test',
      pass: secret,
      reason: 'Internal SMTP credentials at /private/config',
    }),
    kick: () => {},
  };
  const server = createApp(db, { emailService });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  async function call(path, body, cookie) {
    const response = await fetch(base + path, {
      method: body ? 'POST' : 'GET',
      headers: {
        ...(body
          ? { 'Content-Type': 'application/json', 'X-Nautica-Request': '1', Origin: base }
          : {}),
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return {
      status: response.status,
      data: await response.json(),
      cookie: response.headers.get('set-cookie')?.split(';')[0],
    };
  }
  try {
    const user = await call('/api/user/register', {
      name: 'Customer',
      email: 'user@example.test',
      phone: '+919876543210',
      password: 'test-customer-passphrase',
    });
    const date = new Date();
    date.setDate(date.getDate() + 1);
    const booking = await call(
      '/api/bookings',
      {
        boatId: 'b1',
        date: N.localDate(date),
        slot: N.slots[0],
        guests: 1,
        seats: ['01'],
        name: 'Customer',
        phone: '+919876543210',
        extras: ['safety'],
        payment: { type: 'card', network: 'VISA', last4: '4242' },
        requestKey: crypto.randomUUID(),
      },
      user.cookie,
    );
    const row = db.prepare('SELECT record FROM bookings WHERE id=?').get(booking.data.booking.id),
      record = JSON.parse(row.record);
    record.internalNotes = secret;
    record.customer.passwordHash = secret;
    record.customer.sessionToken = secret;
    record.boat.operatorSecret = secret;
    record.trip.accessCode = secret;
    record.payment.rawGatewayResponse = secret;
    record.payment.cardNumber = '4242424242424242';
    record.payment.cvv = '123';
    record.pass.resetToken = secret;
    db.prepare('UPDATE bookings SET record=? WHERE id=?').run(
      JSON.stringify(record),
      booking.data.booking.id,
    );
    db.prepare(
      "UPDATE email_outbox SET last_error_code='SMTP_AUTH_FAILED',attempts=2,status='failed'",
    ).run();
    const mine = await call('/api/user/bookings', null, user.cookie),
      detail = await call('/api/user/bookings/' + booking.data.booking.id, null, user.cookie);
    for (const result of [mine, detail]) {
      const text = JSON.stringify(result.data);
      assert.ok(!text.includes(secret));
      assert.ok(!text.includes('4242424242424242'));
      assert.ok(!text.includes('SMTP_AUTH_FAILED'));
      assert.ok(!text.includes('rawGatewayResponse'));
    }
    assert.equal(mine.data.bookings[0].payment.last4, '4242');
    assert.equal(mine.data.bookings[0].customer.email, 'user@example.test');
    assert.equal(mine.data.bookings[0].notifications[0].attempts, undefined);
    const login = await call('/api/admin/login', {
        username: 'admin',
        password: 'test-admin-passphrase',
      }),
      admin = await call('/api/admin/bookings', null, login.cookie);
    const text = JSON.stringify(admin.data);
    assert.ok(!text.includes(secret));
    assert.ok(!text.includes('smtp-private'));
    assert.ok(!text.includes('routing-private'));
    assert.ok(!text.includes('private-origin'));
    assert.ok(!text.includes('SMTP_AUTH_FAILED'));
    assert.deepEqual(admin.data.emailService, { configured: true, passwordResetEnabled: true });
    assert.equal(admin.data.bookings[0].customer.email, 'user@example.test');
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    db.close();
  }
});
test('public errors do not expose deployment commands or SMTP configuration', async () => {
  const db = openStore(':memory:'),
    server = createApp(db);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const base = 'http://127.0.0.1:' + server.address().port;
    const response = await fetch(base + '/not-a-real-file');
    assert.equal(response.status, 404);
    const data = await response.json();
    assert.ok(!JSON.stringify(data).includes('npm'));
    assert.ok(!JSON.stringify(data).includes('dist/'));
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    db.close();
  }
});
