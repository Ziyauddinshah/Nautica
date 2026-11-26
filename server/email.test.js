/** @file Regression tests for email behavior using isolated fixtures. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import nodemailer from 'nodemailer';
import { SMTPServer } from 'smtp-server';
import { openStore, createBooking, availability } from './store.js';
import {
  emailConfig,
  smtpOptions,
  confirmationMessage,
  createEmailService,
  notificationsFor,
} from './email.js';
import { slots, localDate } from '../src/domain/booking.js';

function input(patch = {}) {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return {
    boatId: 'b1',
    date: localDate(d),
    slot: slots[0],
    guests: 2,
    seats: ['01', '02'],
    name: 'आरव <script>alert(1)</script>',
    email: 'guest@example.test',
    phone: '+919876543210',
    extras: ['safety', 'snacks'],
    payment: { type: 'card', network: 'VISA', last4: '4242' },
    requestKey: randomUUID(),
    ...patch,
  };
}
const config = () =>
  emailConfig({
    SMTP_ENABLED: 'true',
    SMTP_USER: 'sender@gmail.com',
    SMTP_PASS: 'test-only-not-real',
    SMTP_ADMIN_TO: 'admin@example.test',
    PUBLIC_ORIGIN: 'https://nautica.example.test',
  });
const accepted = { sendMail: async (message) => ({ accepted: [message.to.address] }) };
test('Gmail config defaults to TLS, supports mandatory STARTTLS, and never exposes credentials through service status', () => {
  assert.equal(emailConfig({}).configured, false);
  assert.equal(emailConfig({ SMTP_ENABLED: 'true' }).configured, false);
  const c = config(),
    secure = smtpOptions(c);
  assert.equal(secure.host, 'smtp.gmail.com');
  assert.equal(secure.secure, true);
  assert.equal(secure.tls.rejectUnauthorized, true);
  const starttls = smtpOptions({ ...c, port: 587 });
  assert.equal(starttls.secure, false);
  assert.equal(starttls.requireTLS, true);
  const db = openStore(':memory:'),
    service = createEmailService(db, { config: c, transport: accepted });
  assert.ok(!JSON.stringify(service.status()).includes(c.pass));
  db.close();
});
test('customer and admin notifications are transactional, unique and absent for failed bookings', () => {
  const db = openStore(':memory:'),
    body = input();
  const booking = createBooking(db, body);
  createBooking(db, body);
  assert.equal(notificationsFor(db, booking.id).length, 2);
  assert.throws(() => createBooking(db, input()));
  assert.equal(db.prepare('SELECT count(*) AS n FROM email_outbox').get().n, 2);
  db.close();
});
test('confirmation templates include booking/seats/demo payment details, escape HTML, and separate private admin details', () => {
  const db = openStore(':memory:'),
    booking = createBooking(db, input()),
    record = JSON.parse(
      db.prepare('SELECT record FROM bookings WHERE id=?').get(booking.id).record,
    );
  const user = confirmationMessage(
      record,
      'customer',
      config(),
      'guest@example.test',
      '<test@example.test>',
    ),
    admin = confirmationMessage(
      record,
      'admin',
      config(),
      'admin@example.test',
      '<test2@example.test>',
    );
  assert.match(user.text, /Seat numbers: 01, 02/);
  assert.match(user.text, /VISA · 4242/);
  assert.match(user.text, /no real money charged/);
  assert.ok(!user.html.includes('<script>'));
  assert.match(user.html, /&lt;script&gt;/);
  assert.ok(!user.text.includes('Passenger phone'));
  assert.match(admin.text, /Passenger phone: \+919876543210/);
  assert.match(admin.text, /https:\/\/nautica.example.test\/admin/);
  assert.ok(!user.text.includes('Admin dashboard:'));
  db.close();
});
test('disabled SMTP leaves durable notifications pending without affecting the reservation', async () => {
  const db = openStore(':memory:'),
    body = input(),
    booking = createBooking(db, body),
    service = createEmailService(db, { config: emailConfig({}) });
  await service.drain();
  assert.ok(
    notificationsFor(db, booking.id).every((job) => job.status === 'pending' && job.attempts === 0),
  );
  assert.deepEqual(availability(db, body).bookedSeats, ['01', '02']);
  await service.stop();
  db.close();
});
test('failure for one recipient is isolated, retried with stable Message-ID, and never resends the successful recipient', async () => {
  const db = openStore(':memory:'),
    body = input(),
    booking = createBooking(db, body);
  let clock = Date.now(),
    failed = false;
  const messages = [];
  const service = createEmailService(db, {
    config: config(),
    now: () => clock,
    transport: {
      sendMail: async (message) => {
        messages.push(message);
        if (message.to.address === 'guest@example.test' && !failed) {
          failed = true;
          throw Object.assign(new Error('sensitive provider text must not be saved'), {
            code: 'EAUTH',
          });
        }
        return { accepted: [message.to.address] };
      },
    },
  });
  await service.drain();
  let jobs = notificationsFor(db, booking.id);
  assert.equal(jobs.find((j) => j.audience === 'customer').status, 'failed');
  assert.equal(jobs.find((j) => j.audience === 'customer').errorCode, 'SMTP_AUTH_FAILED');
  assert.equal(jobs.find((j) => j.audience === 'admin').status, 'sent');
  assert.ok(!JSON.stringify(jobs).includes('sensitive'));
  await service.drain();
  assert.equal(messages.length, 2);
  clock += 60001;
  await service.drain();
  jobs = notificationsFor(db, booking.id);
  assert.ok(jobs.every((job) => job.status === 'sent'));
  assert.equal(messages.length, 3);
  assert.equal(messages[0].messageId, messages[2].messageId);
  await service.drain();
  assert.equal(messages.length, 3);
  await service.stop();
  db.close();
});
test('queue survives restart and resumes expired send leases', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'nautica-email-')),
    path = join(directory, 'mail.sqlite');
  let db = openStore(path);
  const booking = createBooking(db, input());
  db.prepare(
    "UPDATE email_outbox SET status='sending',attempts=1,lease_until=1,message_id='<retained@example.test>' WHERE audience='customer'",
  ).run();
  db.close();
  db = openStore(path);
  const messages = [];
  const service = createEmailService(db, {
    config: config(),
    transport: {
      sendMail: async (message) => {
        messages.push(message);
        return { accepted: [message.to.address] };
      },
    },
  });
  await service.drain();
  assert.ok(notificationsFor(db, booking.id).every((job) => job.status === 'sent'));
  assert.equal(
    messages.find((message) => message.to.address === 'guest@example.test').messageId,
    '<retained@example.test>',
  );
  await service.stop();
  db.close();
  rmSync(directory, { recursive: true, force: true });
});
test('retry exhaustion stops automatic delivery; explicit retry affects failed messages only', async () => {
  const db = openStore(':memory:'),
    booking = createBooking(db, input());
  let clock = Date.now(),
    working = false,
    count = 0;
  const service = createEmailService(db, {
    config: config(),
    now: () => clock,
    transport: {
      sendMail: async (message) => {
        count++;
        if (!working) throw Object.assign(new Error('test'), { code: 'ECONNECTION' });
        return { accepted: [message.to.address] };
      },
    },
  });
  for (let i = 0; i < 6; i++) {
    await service.drain();
    clock += 86400000;
  }
  assert.equal(count, 10);
  assert.ok(
    notificationsFor(db, booking.id).every((job) => job.attempts === 5 && job.status === 'failed'),
  );
  working = true;
  service.retry(booking.id);
  await service.kick();
  assert.ok(notificationsFor(db, booking.id).every((job) => job.status === 'sent'));
  const sent = count;
  service.retry(booking.id);
  await service.kick();
  assert.equal(count, sent);
  await service.stop();
  db.close();
});
test('real Nodemailer SMTP exchange sends two separate emails to a local test SMTP server', async () => {
  const received = [];
  const smtp = new SMTPServer({
    authOptional: true,
    disabledCommands: ['AUTH', 'STARTTLS'],
    onData(stream, session, callback) {
      let raw = '';
      stream.on('data', (chunk) => (raw += chunk));
      stream.on('end', () => {
        received.push({ to: session.envelope.rcptTo.map((item) => item.address), raw });
        callback();
      });
    },
  });
  await new Promise((resolve) => smtp.listen(0, '127.0.0.1', resolve));
  const db = openStore(':memory:'),
    booking = createBooking(db, input());
  // Plaintext is restricted to this loopback test transport; Gmail configuration always requires TLS.
  const transport = nodemailer.createTransport({
    host: '127.0.0.1',
    port: smtp.server.address().port,
    secure: false,
    ignoreTLS: true,
  });
  const service = createEmailService(db, { config: config(), transport });
  try {
    await service.drain();
    assert.equal(received.length, 2);
    assert.deepEqual(received.flatMap((item) => item.to).sort(), [
      'admin@example.test',
      'guest@example.test',
    ]);
    assert.ok(received.every((item) => item.raw.includes('Content-Type: multipart/alternative')));
    assert.ok(notificationsFor(db, booking.id).every((job) => job.status === 'sent'));
  } finally {
    await service.stop();
    db.close();
    await new Promise((resolve) => smtp.close(resolve));
  }
});

test('a crash during the last attempt becomes a recoverable failed notification rather than staying stuck', async () => {
  const db = openStore(':memory:'),
    booking = createBooking(db, input());
  db.prepare("UPDATE email_outbox SET status='sending',attempts=5,lease_until=1").run();
  let sends = 0;
  const service = createEmailService(db, {
    config: config(),
    transport: {
      sendMail: async (message) => {
        sends++;
        return { accepted: [message.to.address] };
      },
    },
  });
  await service.drain();
  assert.equal(sends, 0);
  assert.ok(
    notificationsFor(db, booking.id).every(
      (job) => job.status === 'failed' && job.errorCode === 'SMTP_DELIVERY_UNKNOWN',
    ),
  );
  service.retry(booking.id);
  await service.kick();
  assert.equal(sends, 2);
  await service.stop();
  db.close();
});
test('Hindi confirmations translate business labels while preserving personal names and references', () => {
  const db = openStore(':memory:');
  try {
    const pass = createBooking(db, input({ name: 'Admin', language: 'hi' }));
    const record = JSON.parse(
      db.prepare('SELECT record FROM bookings WHERE id=?').get(pass.id).record,
    );
    const message = confirmationMessage(record, 'customer', config(), 'guest@example.test', 'test');
    assert.match(message.html, /lang="hi"/);
    assert.match(message.text, /सीट नंबर/);
    assert.match(message.text, /Admin/);
    assert.ok(message.text.includes(pass.id));
    assert.ok(!message.text.includes('सीट नंबर: undefined'));
  } finally {
    db.close();
  }
});
