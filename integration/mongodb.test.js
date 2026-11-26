/** @file Regression tests for mongodb behavior using isolated fixtures. */
import { digest } from '../server/errors.js';
import { AdminMfa } from '../server/security/admin-mfa.js';
import { totp } from '../server/security/totp.js';
import { Operations } from '../server/operations/repository.js';
import { journeyEnd } from '../server/domain/history.js';
import { reminderDate } from '../server/aftercare/reminders.js';
import { MongoSmsStore } from '../server/repositories/mongo-sms.js';
import { createSmsService } from '../server/services/sms.js';
import { Refunds } from '../server/aftercare/refunds.js';
import { OwnerVerification } from '../server/verification/repository.js';
import { boatDocumentTypes, fleetChecks } from '../src/domain/fleet.js';
import { boats as fixtureBoats } from '../src/domain/booking.js';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHmac } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execFileAsync = promisify(execFile);
async function runCLI(command, args, options) {
  try {
    const result = await execFileAsync(command, args, options);
    return { ...result, status: 0 };
  } catch (error) {
    return {
      status: error.code,
      stdout: error.stdout || '',
      stderr: error.stderr || error.message,
    };
  }
}
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import { MongoClient } from 'mongodb';
import { connectMongo, createMongoIndexes } from '../server/repositories/mongo-connection.js';
import { MongoOutboxStore } from '../server/repositories/mongo-outbox.js';
import { MongoPaymentStore } from '../server/repositories/mongo-payments.js';
import { MongoRepository } from '../server/repositories/mongo.js';
import { createPaymentService } from '../server/services/payments.js';
import { createRazorpayGateway } from '../server/services/razorpay.js';
import { createSharedEmailService } from '../server/services/email.js';
import { createApp } from '../server/app.js';
import { openStore, createBooking, setAdmin } from '../server/store.js';
import { initUsers, registerUser } from '../server/users.js';
import { slots, localDate } from '../src/domain/booking.js';
let cluster, uri;
const resources = [];
before(async () => {
  cluster = await MongoMemoryReplSet.create({
    binary: {
      version: '8.0.16',
      ...(process.env.MONGOMS_DOWNLOAD_DIR
        ? { downloadDir: process.env.MONGOMS_DOWNLOAD_DIR }
        : {}),
    },
    instanceOpts: [0, 1, 2].map(() => ({
      args: [
        '--wiredTigerCacheSizeGB',
        '0.25',
        '--oplogSize',
        '16',
        '--setParameter',
        'enableTestCommands=1',
      ],
    })),
    replSet: {
      count: 3,
      storageEngine: 'wiredTiger',
      configSettings: { electionTimeoutMillis: 1500, heartbeatIntervalMillis: 250 },
    },
  });
  uri = cluster.getUri();
});
after(async () => {
  for (const cleanup of resources.reverse()) await cleanup();
  await cluster?.stop();
});
async function fixture() {
  const database = 'nautica_test_' + randomUUID().replaceAll('-', '');
  const env = { MONGODB_URI: uri, MONGODB_DB: database };
  const first = await connectMongo(env, { initialize: true });
  await createMongoIndexes(first.db);
  await first.db
    .collection('metadata')
    .insertOne({ _id: 'schema', version: 1, state: 'ready', instanceId: randomUUID() });
  // Explicit test fixtures only: runtime never imports sample boats into the registry.
  const fixtureOwner = {
    _id: 'fixture-owner',
    id: 'fixture-owner',
    name: 'Fixture Operator',
    phone: '+919876543210',
    email: 'fixture-owner@example.test',
  };
  await first.db.collection('users').insertOne(fixtureOwner);
  await first.db.collection('owner_verifications').insertOne({
    _id: fixtureOwner._id,
    mobile: { phone: fixtureOwner.phone, expiresAt: new Date('2099-01-01') },
    identity: { name: fixtureOwner.name, expiresAt: new Date('2099-01-01') },
  });
  await first.db.collection('boats').insertMany(
    fixtureBoats.map((boat) => ({
      _id: boat.id,
      ownerId: 'fixture-owner',
      status: 'approved',
      revision: 1,
      registrationKey: 'test:' + boat.id,
      details: boat,
      documents: Object.fromEntries(
        boatDocumentTypes.map((type) => [
          type.id,
          { expiresOn: '2099-12-31', scanStatus: 'clean' },
        ]),
      ),
    })),
  );
  const second = await connectMongo(env);
  const a = new MongoRepository(first),
    b = new MongoRepository(second);
  a.mfa = new AdminMfa(a, { key: '0123456789abcdef'.repeat(4) });
  b.mfa = new AdminMfa(b, { key: '0123456789abcdef'.repeat(4) });
  for (const repository of [a, b]) {
    const original = repository.registerUser.bind(repository);
    repository.unverifiedRegistration = original;
    repository.registerUser = async (input) => {
      const result = await original(input);
      await repository
        .c('users')
        .updateOne(
          { _id: result.user.id },
          { $set: { verifiedEmail: result.user.email, emailVerifiedAt: new Date().toISOString() } },
        );
      return { ...result, user: { ...result.user, emailVerified: true } };
    };
  }
  await a.c('users').updateOne(
    { _id: 'fixture-owner' },
    {
      $set: {
        verifiedEmail: 'fixture-owner@example.test',
        emailVerifiedAt: new Date().toISOString(),
      },
    },
  );
  resources.push(async () => {
    await a.db.dropDatabase();
    await a.close();
    await b.close();
  });
  return { a, b, env };
}
const account = (email = randomUUID() + '@example.test') => ({
  name: 'Guest Test',
  email,
  phone: '+919876543210',
  password: 'strong-test-passphrase',
});
const booking = (user, patch = {}) => ({
  boatId: 'b1',
  date: localDate(new Date(Date.now() + 86400000)),
  slot: slots[0],
  guests: 1,
  seats: ['01'],
  name: user.name,
  email: user.email,
  phone: user.phone,
  extras: ['safety'],
  payment: { type: 'upi', provider: 'GPay' },
  requestKey: randomUUID(),
  ...patch,
});
const sign = (message, secret = 'test-secret') =>
  createHmac('sha256', secret).update(message).digest('hex');
function gatewayFixture() {
  const orders = new Map();
  let orderCount = 0,
    captured = true;
  const gateway = createRazorpayGateway({
    keyId: 'rzp_test_public',
    keySecret: 'test-secret',
    webhookSecret: 'test-webhook',
    transport: async (url, options) => {
      if (url.endsWith('/orders')) {
        const input = JSON.parse(options.body),
          id = 'order_' + ++orderCount;
        orders.set(id, input);
        return Response.json({ id, ...input });
      }
      const id = url.split('/').at(-1),
        orderId = 'order_' + id.split('_')[1],
        order = orders.get(orderId);
      return Response.json({
        id,
        order_id: orderId,
        amount: order.amount,
        currency: 'INR',
        status: captured ? 'captured' : 'authorized',
      });
    },
  });
  return {
    gateway,
    orders,
    setCaptured: (value) => {
      captured = value;
    },
    count: () => orderCount,
  };
}
test('two independent servers share durable sessions, history and atomic seat reservations', async () => {
  const { a, b } = await fixture(),
    registered = await a.registerUser(account()),
    user = registered.user;
  assert.equal((await b.authenticateUser(registered.token)).id, user.id);
  const input = booking(user),
    results = await Promise.allSettled([
      a.createBooking(input, 'seats', user),
      b.createBooking({ ...input, requestKey: randomUUID() }, 'seats', user),
    ]);
  assert.equal(results.filter((value) => value.status === 'fulfilled').length, 1);
  assert.equal(results.find((value) => value.status === 'rejected').reason.status, 409);
  const pass = results.find((value) => value.status === 'fulfilled').value;
  assert.equal((await b.userBookings(user.id)).bookings[0].id, pass.id);
  assert.deepEqual((await b.availability(input)).bookedSeats, ['01']);
  assert.equal(await a.c('outbox').countDocuments({}), 2);
  const stranger = (await b.registerUser(account())).user;
  await assert.rejects(b.userBooking(stranger.id, pass.id), { status: 404 });
  const reconnected = await connectMongo({ MONGODB_URI: uri, MONGODB_DB: a.config.database });
  const restored = new MongoRepository(reconnected);
  try {
    assert.equal((await restored.authenticateUser(registered.token)).id, user.id);
    assert.equal((await restored.userBookings(user.id)).total, 1);
  } finally {
    await restored.close();
  }
});
test('simultaneous idempotent requests produce one booking and one pair of email jobs', async () => {
  const { a, b } = await fixture(),
    user = (await a.registerUser(account())).user,
    input = booking(user);
  const passes = await Promise.all([
    a.createBooking(input, 'seats', user),
    b.createBooking(input, 'seats', user),
    a.createBooking(input, 'seats', user),
  ]);
  assert.equal(new Set(passes.map((pass) => pass.id)).size, 1);
  assert.equal(await a.c('bookings').countDocuments({}), 1);
  assert.equal(await a.c('outbox').countDocuments({}), 2);
});
test('rate limits are shared across application replicas and cannot reset on failover', async () => {
  const { a, b } = await fixture();
  for (let count = 0; count < 5; count++)
    await (count % 2 ? a : b).consumeLimits('admin-login', 'one-test-ip');
  await assert.rejects(a.consumeLimits('admin-login', 'one-test-ip'), { status: 429 });
  await assert.rejects(b.consumeLimits('admin-login', 'one-test-ip'), { status: 429 });
});
test('password reset is single-use across replicas and revokes every old session', async () => {
  const { a, b } = await fixture(),
    input = account(),
    registered = await a.registerUser(input),
    other = await b.loginUser(input);
  const job = await a.requestPasswordReset(
    { email: input.email },
    { enabled: true, siteOrigin: 'https://example.test' },
  );
  await b.resetUserPassword({ token: job.token, newPassword: 'new-secure-passphrase' });
  await assert.rejects(a.authenticateUser(registered.token), { status: 401 });
  await assert.rejects(a.authenticateUser(other.token), { status: 401 });
  await assert.rejects(
    a.resetUserPassword({ token: job.token, newPassword: 'another-passphrase' }),
    { status: 400 },
  );
  assert.ok((await a.loginUser({ ...input, password: 'new-secure-passphrase' })).token);
});
test('distributed checkout holds seats; duplicate callbacks and webhooks confirm exactly one booking', async () => {
  const { a, b } = await fixture(),
    user = (await a.registerUser(account())).user,
    { gateway, count, setCaptured } = gatewayFixture(),
    pa = createPaymentService(new MongoPaymentStore(a), gateway),
    pb = createPaymentService(new MongoPaymentStore(b), gateway),
    input = booking(user);
  const order = await pa.order(
    { ...input, cvv: 'PRIVATE_CVV', cardNumber: 'PRIVATE_PAN', upi: 'PRIVATE_UPI' },
    user,
  );
  assert.ok(
    !JSON.stringify(await a.c('payments').findOne({ _id: order.attemptId })).includes('PRIVATE_'),
  );
  assert.equal(order.amount, 126000);
  assert.equal(order.currency, 'INR');
  assert.deepEqual((await b.availability(input)).bookedSeats, ['01']);
  await assert.rejects(pb.order({ ...input, requestKey: randomUUID() }, user), { status: 409 });
  assert.equal((await pb.order(input, user)).orderId, order.orderId);
  assert.equal(count(), 1);
  const verify = {
    attemptId: order.attemptId,
    orderId: order.orderId,
    paymentId: 'pay_1',
    signature: sign(order.orderId + '|pay_1'),
  };
  await assert.rejects(pb.verify({ ...verify, signature: '0'.repeat(64) }, user), { status: 400 });
  setCaptured(false);
  await assert.rejects(pa.verify(verify, user), { status: 409 });
  assert.equal(await a.c('bookings').countDocuments({}), 0);
  setCaptured(true);
  const raw = JSON.stringify({
    event: 'payment.captured',
    payload: { payment: { entity: { id: 'pay_1', order_id: order.orderId } } },
  });
  const results = await Promise.all([
    pa.verify(verify, user),
    pb.verify(verify, user),
    pb.webhook(raw, sign(raw, 'test-webhook')),
  ]);
  assert.equal(results[0].id, results[1].id);
  assert.equal(results[0].paymentStatus, 'paid');
  const receiptRecord = await a.c('payments').findOne({ bookingId: results[0].id });
  assert.equal(receiptRecord.kind, 'booking_payment');
  assert.equal(receiptRecord.verification, 'provider_verified');
  assert.equal(receiptRecord.currency, 'INR');
  assert.equal(await a.c('payments').countDocuments({}), 1);
  const ledger = await b.userPayments(user.id, {});
  assert.equal(ledger.total, 1);
  assert.equal(ledger.payments[0].status, 'paid');
  setCaptured(false);
  assert.equal((await pb.verify(verify, user)).id, results[0].id);
  assert.equal(await a.c('bookings').countDocuments({}), 1);
  assert.equal(await a.c('outbox').countDocuments({}), 2);
});
test('a late captured payment cannot steal seats already reserved by another booking', async () => {
  const { a, b } = await fixture(),
    user = (await a.registerUser(account())).user,
    { gateway } = gatewayFixture(),
    pa = createPaymentService(new MongoPaymentStore(a), gateway),
    pb = createPaymentService(new MongoPaymentStore(b), gateway),
    input = booking(user),
    order = await pa.order(input, user);
  const trip = await a.c('inventory').findOne({});
  await a.c('inventory').updateOne({ _id: trip._id }, { $set: { 'occupied.01.expires': 0 } });
  await b.createBooking({ ...input, requestKey: randomUUID() }, 'seats', user);
  const raw = JSON.stringify({
    event: 'payment.captured',
    payload: { payment: { entity: { id: 'pay_1', order_id: order.orderId } } },
  });
  await pa.webhook(raw, sign(raw, 'test-webhook'));
  await pb.webhook(raw, sign(raw, 'test-webhook'));
  assert.equal(await a.c('bookings').countDocuments({}), 1);
  assert.equal((await pb.attention())[0].status, 'refund_required');
});
test('email workers on different replicas claim independent fenced jobs without normal duplicate sends', async () => {
  const { a, b } = await fixture(),
    user = (await a.registerUser(account())).user;
  await a.createBooking(booking(user), 'seats', user);
  const sent = [],
    config = {
      enabled: true,
      configured: true,
      user: 'sender@gmail.com',
      adminTo: 'admin@example.test',
      siteOrigin: 'https://example.test',
    },
    transport = {
      sendMail: async (message) => {
        sent.push(message);
        return { accepted: [message.to.address] };
      },
    };
  const ea = createSharedEmailService(new MongoOutboxStore(a), { config, transport }),
    eb = createSharedEmailService(new MongoOutboxStore(b), { config, transport });
  await Promise.all([ea.drain(), eb.drain()]);
  assert.equal(sent.length, 2);
  assert.equal(new Set(sent.map((message) => message.messageId)).size, 2);
  assert.equal(await a.c('outbox').countDocuments({ status: 'sent' }), 2);
  await ea.stop();
  await eb.stop();
});
test('HTTP replicas authenticate shared cookies and never expose database configuration', async () => {
  const { a, b } = await fixture();
  const servers = [];
  try {
    for (const repository of [a, b]) {
      const server = createApp(null, { repository });
      await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
      servers.push(server);
    }
    const origins = servers.map((server) => 'http://127.0.0.1:' + server.address().port),
      input = account();
    const response = await fetch(origins[0] + '/api/user/register', {
        method: 'POST',
        headers: {
          Origin: origins[0],
          'Content-Type': 'application/json',
          'X-Nautica-Request': '1',
        },
        body: JSON.stringify(input),
      }),
      cookie = response.headers.get('set-cookie').split(';')[0];
    assert.equal(response.status, 201);
    const session = await fetch(origins[1] + '/api/user/session', { headers: { Cookie: cookie } }),
      body = await session.json();
    assert.equal(body.user.email, input.email);
    assert.ok(!JSON.stringify(body).includes('mongodb'));
    const setup = await runCLI(process.execPath, ['scripts/admin-create.js'], {
      env: {
        ...process.env,
        NODE_ENV: 'test',
        MONGODB_URI: uri,
        MONGODB_DB: a.config.database,
        NAUTICA_ADMIN_USER: 'admin',
        NAUTICA_ADMIN_PASSWORD: 'admin-test-passphrase',
      },
      encoding: 'utf8',
    });
    assert.equal(setup.status, 0, setup.stderr);
    assert.ok(!setup.stdout.includes('admin-test-passphrase'));
    await a.setAdmin('admin', 'admin-test-passphrase');
    const admin = await fullAdminLogin(a, 'admin', 'admin-test-passphrase');
    assert.equal(await b.authenticateAdmin(admin.token), 'admin');
  } finally {
    for (const server of servers) {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    }
  }
});
test('read-only SQLite migration preserves accounts, hashes, ownership, seats, payment records and the outbox', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'nautica-import-')),
    filename = join(directory, 'source.sqlite'),
    database = 'nautica_test_' + randomUUID().replaceAll('-', '');
  const db = openStore(filename);
  initUsers(db);
  const input = account(),
    user = registerUser(db, input).user;
  const pass = createBooking(db, booking(user), 'seats', user);
  setAdmin(db, 'admin', 'admin-test-passphrase');
  db.close();
  const env = { ...process.env, NODE_ENV: 'test', MONGODB_URI: uri, MONGODB_DB: database };
  try {
    const result = await runCLI(process.execPath, ['scripts/migrate-sqlite.js', filename], {
      env,
      encoding: 'utf8',
      cwd: resolve('.'),
      timeout: 30000,
    });
    assert.equal(result.status, 0, result.stderr);
    const connection = await connectMongo(env),
      repo = new MongoRepository(connection);
    try {
      const importedPayment = await repo.c('payments').findOne({ bookingId: pass.id });
      assert.equal(importedPayment.status, 'demo_paid');
      assert.equal(importedPayment.verification, 'demo');
      assert.equal((await repo.loginUser(input)).user.id, user.id);
      assert.equal((await repo.userBookings(user.id)).bookings[0].id, pass.id);
      await assert.rejects(repo.availability(booking(user)), { status: 409 });
      assert.deepEqual((await repo.userBookings(user.id)).bookings[0].trip.seats, ['01']);
      assert.equal(await repo.c('outbox').countDocuments({}), 2);
      assert.equal(
        (await fullAdminLogin(repo, 'admin', 'admin-test-passphrase')).username,
        'admin',
      );
      await repo.db.dropDatabase();
    } finally {
      await repo.close();
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
test('an uncertain commit retries the commit without rerunning the business callback', async () => {
  const { a } = await fixture(),
    admin = a.client.db('admin');
  await admin.command({
    configureFailPoint: 'failCommand',
    mode: { times: 3 },
    data: {
      failCommands: ['commitTransaction'],
      writeConcernError: { code: 64, errmsg: 'test-only unknown commit' },
      errorLabels: ['UnknownTransactionCommitResult'],
    },
  });
  let executions = 0;
  await a.transaction(async (session) => {
    executions++;
    await a.c('limits').insertOne({ _id: 'commit-proof', count: 1 }, { session });
  });
  assert.equal(executions, 1);
  assert.equal(await a.c('limits').countDocuments({ _id: 'commit-proof' }), 1);
});
test('loss of database quorum refuses confirmations and recovery preserves the last committed booking', async () => {
  const { a, b } = await fixture(),
    user = (await a.registerUser(account())).user,
    input = booking(user),
    pass = await a.createBooking(input, 'seats', user);
  const hello = await a.client.db('admin').command({ hello: 1 }),
    primaryPort = Number(hello.primary.split(':').at(-1)),
    secondary = cluster.servers.filter((server) => server.instanceInfo.port !== primaryPort);
  const server = createApp(null, { repository: b });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    await Promise.all(secondary.map((member) => member.stop({ doCleanup: false })));
    const response = await fetch('http://127.0.0.1:' + server.address().port + '/api/health');
    assert.equal(response.status, 503);
    await assert.rejects(
      a.createBooking({ ...input, seats: ['02'], requestKey: randomUUID() }, 'seats', user),
    );
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await Promise.all(secondary.map((member) => member.start(true)));
  }
  // Topology discovery waits for a new majority-elected primary.
  await b.health();
  assert.equal((await b.userBookings(user.id)).bookings[0].id, pass.id);
  assert.equal(await b.c('bookings').countDocuments({}), 1);
  assert.equal(await b.c('outbox').countDocuments({}), 2);
});
test('proxy-authenticated client IPs share limits across replicas while forged headers are ignored', async () => {
  const { a, b } = await fixture(),
    token = 'only-test-proxy-token-' + randomUUID(),
    servers = [];
  try {
    for (const repository of [a, b]) {
      const server = createApp(null, { repository, proxyToken: token });
      await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
      servers.push(server);
    }
    const call = async (index, ip, proof = token) => {
      const origin = 'http://127.0.0.1:' + servers[index].address().port;
      return fetch(origin + '/api/user/login', {
        method: 'POST',
        headers: {
          Origin: origin,
          'Content-Type': 'application/json',
          'X-Nautica-Request': '1',
          'X-Forwarded-For': ip,
          'X-Nautica-Proxy-Token': proof,
        },
        body: JSON.stringify({ email: 'rate@example.test', password: 'incorrect-test-passphrase' }),
      });
    };
    // The shared account key permits 15 attempts; use a separate email per IP below only when testing transport identity.
    await call(0, '192.0.2.1');
    await call(1, '192.0.2.1');
    await call(0, '192.0.2.2');
    await call(0, '192.0.2.99', 'forged');
    const { digest } = await import('../server/errors.js');
    assert.equal(
      (await a.c('limits').findOne({ _id: 'login:ip:' + digest('192.0.2.1') })).count,
      2,
    );
    assert.equal(
      (await b.c('limits').findOne({ _id: 'login:ip:' + digest('192.0.2.2') })).count,
      1,
    );
    assert.equal(await a.c('limits').findOne({ _id: 'login:ip:' + digest('192.0.2.99') }), null);
  } finally {
    for (const server of servers) {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    }
  }
});
test('an obsolete email worker cannot acknowledge or fail a newly claimed job', async () => {
  const { a, b } = await fixture(),
    user = (await a.registerUser(account())).user;
  await a.createBooking(booking(user), 'seats', user);
  const first = new MongoOutboxStore(a, { now: () => 1000 }),
    second = new MongoOutboxStore(b, { now: () => 122000 }),
    old = await first.claim(),
    fresh = await second.claim();
  assert.equal(old._id, fresh._id);
  assert.notEqual(old.leaseToken, fresh.leaseToken);
  assert.equal((await first.succeed(old)).matchedCount, 0);
  assert.equal((await first.fail(old)).matchedCount, 0);
  assert.equal((await second.succeed(fresh)).matchedCount, 1);
});
test('history filters and payment pagination operate on all owner records, including migrated payments and unbooked attempts', async () => {
  const { a, b } = await fixture(),
    user = (await a.registerUser(account())).user,
    stranger = (await a.registerUser(account())).user;
  const pass = await a.createBooking(booking(user), 'seats', user),
    original = await a.c('bookings').findOne({ _id: pass.id });
  const old = [];
  for (let index = 0; index < 55; index++) {
    const id = 'NTC-HISTORY-' + index;
    old.push({
      ...original,
      _id: id,
      id,
      requestKey: randomUUID(),
      trip: { ...original.trip, date: '2020-01-01' },
      createdAt: new Date(Date.UTC(2020, 0, 1, index)).toISOString(),
    });
  }
  await a.c('bookings').insertMany(old);
  await a.c('payments').insertMany([
    {
      _id: randomUUID(),
      userId: user.id,
      requestKey: randomUUID(),
      payload: booking(user),
      amount: 126000,
      status: 'refund_required',
      expires: Date.now() + 900000,
      paymentId: 'pay_refund',
    },
    {
      _id: randomUUID(),
      userId: stranger.id,
      requestKey: randomUUID(),
      payload: booking(stranger),
      amount: 999999,
      status: 'created',
      expires: Date.now() + 900000,
    },
  ]);
  const upcoming = await b.userBookings(user.id, { view: 'upcoming' });
  assert.equal(upcoming.total, 1);
  assert.equal(upcoming.payments[0].reference, 'pay_refund');
  assert.equal(upcoming.bookings[0].id, pass.id);
  assert.deepEqual(upcoming.counts, { all: 56, upcoming: 1, past: 55 });
  const previous = await b.userBookings(user.id, { view: 'past', offset: 50 });
  assert.equal(previous.total, 55);
  assert.equal(previous.bookings.length, 5);
  assert.ok(previous.bookings.every((record) => record.trip.date === '2020-01-01'));
  const payments = await b.userPayments(user.id, {});
  assert.equal(payments.total, 57);
  assert.equal(payments.payments.length, 50);
  assert.equal(
    payments.payments.find((row) => row.reference === 'pay_refund').status,
    'refund_required',
  );
  assert.ok(payments.payments.some((row) => row.status === 'demo_paid'));
  assert.ok(payments.payments.every((row) => row.amount !== 999999));
  const secondPage = await b.userPayments(user.id, { offset: 50 });
  assert.equal(secondPage.payments.length, 7);
  assert.ok(!JSON.stringify(payments).includes('requestHash'));
  assert.ok(!JSON.stringify(payments).includes(stranger.email));
});
test('new bookings atomically save one linked payment and historical backfill is repeatable across replicas', async () => {
  const { backfillPaymentRecords } = await import('../server/repositories/payment-records.js');
  const { a, b } = await fixture(),
    user = (await a.registerUser(account())).user,
    input = booking(user),
    pass = await a.createBooking(input, 'seats', user);
  const payment = await b.c('payments').findOne({ bookingId: pass.id });
  assert.equal(payment.kind, 'booking_payment');
  assert.equal(payment.status, 'demo_paid');
  assert.equal(payment.amount, 126000);
  assert.equal(payment.userId, user.id);
  assert.equal(payment.verification, 'demo');
  await b.createBooking(input, 'seats', user);
  assert.equal(await a.c('payments').countDocuments({ bookingId: pass.id }), 1);
  assert.equal((await b.userPayments(user.id)).total, 1);
  // Reproduce a migrated booking whose payment existed only in its booking document.
  await a.c('payments').deleteOne({ _id: payment._id });
  const outboxCount = await a.c('outbox').countDocuments({}),
    seatSnapshot = JSON.stringify(await a.c('inventory').findOne({}));
  await Promise.all([backfillPaymentRecords(a), backfillPaymentRecords(b)]);
  assert.equal(await b.c('payments').countDocuments({ bookingId: pass.id }), 1);
  assert.deepEqual(await backfillPaymentRecords(a), { created: 0, updated: 0, unchanged: 1 });
  assert.equal(await a.c('outbox').countDocuments({}), outboxCount);
  assert.equal(JSON.stringify(await a.c('inventory').findOne({})), seatSnapshot);
  assert.equal((await b.userPayments(user.id)).total, 1);
  await a.c('payments').updateOne({ bookingId: pass.id }, { $set: { status: 'refunded' } });
  await backfillPaymentRecords(b);
  assert.equal((await b.userPayments(user.id)).payments[0].status, 'refunded');
  assert.equal((await b.userBooking(user.id, pass.id)).payment.status, 'refunded');
  assert.equal((await b.userBookings(user.id)).bookings[0].payment.status, 'refunded');
  assert.equal((await b.adminBookings({})).bookings[0].payment.status, 'refunded');
});
test('SMS jobs commit with bookings once, remain separate from email and coordinate worker sends across replicas', async () => {
  const { MongoSmsStore } = await import('../server/repositories/mongo-sms.js');
  const { createSmsService } = await import('../server/services/sms.js');
  const { a, b } = await fixture();
  a.smsEnabled = true;
  a.smsAdminEnabled = true;
  b.smsEnabled = true;
  b.smsAdminEnabled = true;
  const user = (await a.registerUser(account())).user,
    input = booking(user),
    passes = await Promise.all([
      a.createBooking(input, 'seats', user),
      b.createBooking(input, 'seats', user),
    ]);
  assert.equal(passes[0].id, passes[1].id);
  assert.equal(await a.c('sms_outbox').countDocuments({}), 2);
  assert.equal(await a.c('outbox').countDocuments({}), 2);
  const sent = [],
    gateway = {
      enabled: true,
      config: { countryCode: '91', adminTo: '+919999999999', deviceId: 'a'.repeat(24) },
      send: async (recipient, message) => {
        sent.push({ recipient, message });
        return { batchId: (sent.length === 1 ? 'b' : 'c').repeat(24) };
      },
      status: async () => ({ status: 'delivered' }),
    };
  const sa = createSmsService(new MongoSmsStore(a), gateway),
    sb = createSmsService(new MongoSmsStore(b), gateway);
  await Promise.all([sa.drain(), sb.drain()]);
  assert.equal(sent.length, 2);
  assert.equal(await a.c('sms_outbox').countDocuments({ status: 'accepted' }), 2);
  assert.equal(await a.c('outbox').countDocuments({ status: 'pending' }), 2);
  await a.c('sms_outbox').updateMany({}, { $set: { nextPollAt: 0 } });
  await Promise.all([sa.drain(), sb.drain()]);
  assert.equal(await b.c('sms_outbox').countDocuments({ status: 'delivered' }), 2);
  assert.equal(sent.length, 2);
  const view = await b.userBooking(user.id, passes[0].id);
  assert.equal(view.notifications.filter((item) => item.channel === 'sms').length, 1);
  assert.ok(!JSON.stringify(view).includes('batchId'));
  assert.ok(!JSON.stringify(view).includes('deviceId'));
  assert.ok(!JSON.stringify(view).includes('leaseToken'));
  await sa.stop();
  await sb.stop();
});
test('SMS unknown outcomes and expired leases do not resend, and stale workers cannot acknowledge reclaimed jobs', async () => {
  const { MongoSmsStore } = await import('../server/repositories/mongo-sms.js');
  const { createSmsService } = await import('../server/services/sms.js');
  const { SmsError } = await import('../server/services/textbee.js');
  const { a, b } = await fixture();
  a.smsEnabled = true;
  const user = (await a.registerUser(account())).user,
    pass = await a.createBooking(booking(user), 'seats', user);
  let calls = 0;
  const gateway = {
    enabled: true,
    config: { countryCode: '91' },
    send: async () => {
      calls++;
      throw new SmsError('SMS_REQUEST_UNKNOWN', { unknown: true });
    },
  };
  const worker = createSmsService(new MongoSmsStore(a), gateway);
  await worker.drain();
  await worker.drain();
  assert.equal(calls, 1);
  assert.equal((await a.c('sms_outbox').findOne({ bookingId: pass.id })).status, 'unknown');
  await a
    .c('sms_outbox')
    .updateMany({}, { $set: { status: 'pending', attempts: 0, nextAttemptAt: 0 } });
  const storeA = new MongoSmsStore(a),
    storeB = new MongoSmsStore(b),
    job = await storeA.claim();
  await a.c('sms_outbox').updateOne({ _id: job._id }, { $set: { leaseUntil: 0 } });
  assert.equal(await storeB.claim(), null);
  assert.equal(
    (await storeA.accepted(job, '+919876543210', 'b'.repeat(24), 'a'.repeat(24))).matchedCount,
    0,
  );
  await storeB.retry(pass.id);
  assert.equal((await a.c('sms_outbox').findOne({ _id: job._id })).status, 'unknown');
  await worker.stop();
});
test('SMS rate-limit rejections retry with a bounded budget and never resend an accepted batch', async () => {
  const { MongoSmsStore } = await import('../server/repositories/mongo-sms.js');
  const { createSmsService } = await import('../server/services/sms.js');
  const { SmsError } = await import('../server/services/textbee.js');
  const { a } = await fixture();
  a.smsEnabled = true;
  const user = (await a.registerUser(account())).user,
    pass = await a.createBooking(booking(user), 'seats', user);
  let calls = 0,
    limited = true;
  const gateway = {
    enabled: true,
    config: { countryCode: '91', deviceId: 'a'.repeat(24) },
    send: async () => {
      calls++;
      if (limited) throw new SmsError('SMS_RATE_LIMITED', { retryable: true });
      return { batchId: 'b'.repeat(24) };
    },
  };
  const worker = createSmsService(new MongoSmsStore(a), gateway);
  for (let index = 0; index < 3; index++) {
    await a.c('sms_outbox').updateMany({}, { $set: { nextAttemptAt: 0 } });
    await worker.drain();
  }
  assert.equal(calls, 3);
  assert.equal((await a.c('sms_outbox').findOne({ bookingId: pass.id })).status, 'failed');
  await worker.drain();
  assert.equal(calls, 3);
  limited = false;
  await worker.retry(pass.id);
  await worker.drain();
  assert.equal(calls, 4);
  assert.equal((await a.c('sms_outbox').findOne({ bookingId: pass.id })).status, 'accepted');
  await worker.retry(pass.id);
  await worker.drain();
  assert.equal(calls, 4);
  await worker.stop();
});

const fleetDetails = (patch = {}) => ({
  name: 'Verified Ganga boat',
  operatorName: 'Private Owner Name',
  registrationNumber: 'UP-' + randomUUID().slice(0, 8),
  registrationAuthority: 'Varanasi issuing authority',
  description: 'Registered passenger boat for a Ganga journey.',
  boardingInstructions: 'Meet the captain at the designated Assi boarding point.',
  type: 'Wooden boat',
  propulsion: 'manual',
  pier: 'Assi Ghat',
  capacity: 6,
  fare: 120000,
  lifeJackets: 7,
  captainIncluded: true,
  amenities: ['Life jackets'],
  ...patch,
});
const fleetReview = {
  action: 'approve',
  notes: 'Verified originals and authority references independently.',
  checks: Object.fromEntries(fleetChecks.map(([key]) => [key, true])),
};
const pdf = Buffer.from('%PDF-1.4\nTest private document\n%%EOF');
async function documented(repo, actor, details = fleetDetails()) {
  if (actor.role === 'owner') await verifiedFixture(repo, actor.id);
  else details = { ...details, ownerEmail: 'fixture-owner@example.test' };
  let boat = await repo.fleet.create(actor, details);
  for (const type of boatDocumentTypes)
    boat = await repo.fleet.upload(boat.id, actor, {
      revision: boat.revision,
      category: type.id,
      number: 'PRIVATE-' + type.id,
      issuer: 'Verified authority',
      issuedOn: '2025-01-01',
      expiresOn: '2099-12-31',
      mime: 'application/pdf',
      data: pdf.toString('base64'),
    });
  return boat;
}
test('boat registry enforces ownership, complete documentation, independent admin review and durable private files', async () => {
  const { a, b } = await fixture();
  await a.c('boats').deleteMany({});
  const user = (await a.registerUser(account())).user,
    actor = { role: 'owner', id: user.id },
    stranger = { role: 'owner', id: 'stranger' },
    reviewer = { role: 'admin', id: 'independent-reviewer' };
  assert.deepEqual((await a.fleet.catalog()).boats, []);
  await verifiedFixture(a, user.id);
  const draft = await a.fleet.create(actor, fleetDetails());
  await assert.rejects(a.fleet.create(actor, draft.details), { status: 409 });
  await assert.rejects(a.fleet.submit(draft.id, actor, { revision: 1, declaration: true }), {
    status: 400,
  });
  await assert.rejects(b.fleet.detail(draft.id, stranger), { status: 404 });
  await assert.rejects(b.fleet.upload(draft.id, stranger, { revision: 1 }), { status: 404 });
  await assert.rejects(a.fleet.update(draft.id, actor, { revision: 0, details: draft.details }), {
    status: 409,
  });
  let boat = await documented(a, actor);
  const doc = boat.documents.registration;
  assert.deepEqual((await b.fleet.download(boat.id, doc.id, actor)).bytes, pdf);
  await assert.rejects(b.fleet.download(boat.id, doc.id, stranger), { status: 404 });
  boat = await b.fleet.submit(boat.id, actor, { revision: boat.revision, declaration: true });
  assert.equal((await a.fleet.catalog()).boats.length, 0);
  await assert.rejects(a.createBooking(booking(user, { boatId: boat.id }), 'seats', user), {
    status: 409,
  });
  await assert.rejects(
    a.fleet.review(boat.id, actor, { ...fleetReview, revision: boat.revision }),
    { status: 403 },
  );
  await assert.rejects(
    a.fleet.review(boat.id, reviewer, { ...fleetReview, checks: {}, revision: boat.revision }),
    { status: 400 },
  );
  boat = await a.fleet.review(boat.id, reviewer, { ...fleetReview, revision: boat.revision });
  const catalog = await b.fleet.catalog();
  assert.equal(catalog.boats[0].id, boat.id);
  assert.equal(catalog.boats[0].seatPlan.length, 6);
  for (const privateValue of [
    'PRIVATE-',
    'Private Owner',
    'registrationNumber',
    '"documents":',
    'ownerId',
    '"review":',
  ])
    assert.ok(!JSON.stringify(catalog).includes(privateValue), privateValue);
  const pass = await b.createBooking(booking(user, { boatId: boat.id }), 'seats', user);
  assert.equal(pass.boat.name, boat.details.name);
  await assert.rejects(
    a.fleet.update(boat.id, actor, { revision: boat.revision, details: boat.details }),
    { status: 409 },
  );
  boat = await a.fleet.review(boat.id, reviewer, {
    action: 'suspend',
    revision: boat.revision,
    notes: 'Operations suspended pending authority reinspection.',
  });
  assert.equal((await b.fleet.catalog()).boats.length, 0);
  await assert.rejects(
    b.createBooking(booking(user, { boatId: boat.id, seats: ['02'] }), 'seats', user),
    { status: 409 },
  );
  assert.equal((await b.userBooking(user.id, pass.id)).pass.boat.name, boat.details.name);
  assert.ok(
    (await a.fleet.detail(boat.id, actor)).audit.some((event) => event.action === 'approve'),
  );
  // Idempotent recovery remains available after suspension.
  const stored = await a.c('bookings').findOne({ _id: pass.id });
  assert.equal(
    (
      await b.createBooking(
        booking(user, { boatId: boat.id, requestKey: stored.requestKey }),
        'seats',
        user,
      )
    ).id,
    pass.id,
  );
});
test('admin-created submissions require another administrator; expired documents and travel beyond validity are blocked', async () => {
  const { a, b } = await fixture(),
    maker = { role: 'admin', id: 'maker' },
    checker = { role: 'admin', id: 'checker' };
  let boat = await documented(a, maker);
  boat = await a.fleet.submit(boat.id, maker, { revision: boat.revision, declaration: true });
  await assert.rejects(
    b.fleet.review(boat.id, maker, { ...fleetReview, revision: boat.revision }),
    { status: 403 },
  );
  boat = await b.fleet.review(boat.id, checker, { ...fleetReview, revision: boat.revision });
  await a
    .c('boats')
    .updateOne({ _id: boat.id }, { $set: { 'documents.insurance.expiresOn': '2020-01-01' } });
  assert.ok(!(await b.fleet.catalog()).boats.some((item) => item.id === boat.id));
  await assert.rejects(b.fleet.bookable(boat.id, '2030-01-01'), { status: 409 });
  await a
    .c('boats')
    .updateOne({ _id: boat.id }, { $set: { 'documents.insurance.expiresOn': '2027-01-01' } });
  await assert.rejects(b.fleet.bookable(boat.id, '2027-01-02'), { status: 409 });
});
test('a captured payment after fleet suspension enters refund attention instead of creating a booking', async () => {
  const { a, b } = await fixture(),
    user = (await a.registerUser(account())).user,
    actor = { role: 'owner', id: user.id },
    reviewer = { role: 'admin', id: 'reviewer' };
  let boat = await documented(a, actor);
  boat = await a.fleet.submit(boat.id, actor, { revision: boat.revision, declaration: true });
  boat = await a.fleet.review(boat.id, reviewer, { ...fleetReview, revision: boat.revision });
  const { gateway } = gatewayFixture(),
    payments = createPaymentService(new MongoPaymentStore(a), gateway),
    input = booking(user, { boatId: boat.id }),
    order = await payments.order(input, user);
  await assert.rejects(
    b.fleet.update(boat.id, actor, { revision: boat.revision, details: boat.details }),
    { status: 409 },
  );
  await b.fleet.review(boat.id, reviewer, {
    action: 'suspend',
    revision: boat.revision,
    notes: 'Safety concern requires suspension now.',
  });
  await assert.rejects(
    payments.verify(
      {
        attemptId: order.attemptId,
        orderId: order.orderId,
        paymentId: 'pay_1',
        signature: sign(order.orderId + '|pay_1'),
      },
      user,
    ),
    { status: 409 },
  );
  assert.equal((await b.c('payments').findOne({ _id: order.attemptId })).status, 'refund_required');
  assert.equal(await b.c('bookings').countDocuments({}), 0);
  assert.equal((await b.userPayments(user.id)).payments[0].boat.name, boat.details.name);
});
test('fleet HTTP routes protect documents, roles and same-origin writes', async () => {
  const { a } = await fixture(),
    user = await a.registerUser(account()),
    actor = { role: 'owner', id: user.user.id };
  const boat = await documented(a, actor),
    server = createApp(null, { repository: a });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port,
    path = '/api/owner/boats/' + boat.id,
    headers = { Cookie: 'nautica_user=' + user.token };
  try {
    assert.equal((await fetch(origin + path)).status, 401);
    assert.equal((await fetch(origin + '/api/admin/fleet', { headers })).status, 401);
    const docPath = path + '/documents/' + boat.documents.registration.id;
    assert.equal((await fetch(origin + docPath)).status, 401);
    const response = await fetch(origin + docPath, { headers });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-disposition'), /^attachment/);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), pdf);
    const forged = await fetch(origin + path + '/review', {
      method: 'POST',
      headers: {
        ...headers,
        Origin: origin,
        'Content-Type': 'application/json',
        'X-Nautica-Request': '1',
      },
      body: JSON.stringify({ ...fleetReview, revision: boat.revision, role: 'admin' }),
    });
    assert.equal(forged.status, 403);
    const cross = await fetch(origin + path + '/submit', {
      method: 'POST',
      headers: {
        ...headers,
        Origin: 'https://evil.test',
        'Content-Type': 'application/json',
        'X-Nautica-Request': '1',
      },
      body: '{}',
    });
    assert.equal(cross.status, 403);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
test('a concurrent owner edit and booking cannot both commit against the same approval', async () => {
  const { a, b } = await fixture(),
    user = (await a.registerUser(account())).user,
    actor = { role: 'owner', id: user.id },
    reviewer = { role: 'admin', id: 'checker' };
  let boat = await documented(a, actor);
  boat = await a.fleet.submit(boat.id, actor, { revision: boat.revision, declaration: true });
  boat = await a.fleet.review(boat.id, reviewer, { ...fleetReview, revision: boat.revision });
  const outcomes = await Promise.allSettled([
    a.createBooking(booking(user, { boatId: boat.id }), 'seats', user),
    b.fleet.update(boat.id, actor, {
      revision: boat.revision,
      details: { ...boat.details, name: 'Updated registered boat' },
    }),
  ]);
  assert.equal(outcomes.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(outcomes.find((result) => result.status === 'rejected').reason.status, 409);
  const saved = await b.fleet.detail(boat.id, actor),
    booked = await a.c('bookings').countDocuments({ 'boat.id': boat.id });
  assert.equal(saved.status, booked ? 'approved' : 'draft');
});

async function verifiedFixture(repo, id) {
  const user = await repo.c('users').findOne({ _id: id });
  await repo.c('owner_verifications').updateOne(
    { _id: id },
    {
      $set: {
        mobile: { phone: user.phone, expiresAt: new Date('2099-01-01') },
        identity: { name: user.name, expiresAt: new Date('2099-01-01') },
      },
    },
    { upsert: true },
  );
}
test('mobile OTPs are private, bounded, single use and shared between replicas', async () => {
  const { a, b } = await fixture(),
    user = (await a.registerUser(account())).user;
  const messages = [];
  const options = {
    secret: 'test-otp-secret-that-is-at-least-32-characters',
    sms: {
      enabled: true,
      async send(phone, message) {
        messages.push({ phone, message });
      },
    },
  };
  a.verification = new OwnerVerification(a, options);
  b.verification = new OwnerVerification(b, options);
  await assert.rejects(a.fleet.create({ role: 'owner', id: user.id }, fleetDetails()), {
    status: 409,
  });
  await a.verification.sendCode(user.id, { phone: '9876543210', consent: true });
  assert.equal(messages[0].phone, '+919876543210');
  const code = messages[0].message.match(/code is (\d{6})/)[1],
    wrong = code === '000000' ? '000001' : '000000';
  const challenge = await b.c('mobile_challenges').findOne({ _id: user.id });
  assert.ok(!JSON.stringify(challenge).includes(code));
  assert.equal(challenge.attempts, 0);
  await assert.rejects(b.verification.sendCode(user.id, { phone: '9876543210', consent: true }), {
    status: 429,
  });
  await assert.rejects(b.verification.verifyCode(user.id, { code: wrong }), { status: 400 });
  assert.equal((await a.c('mobile_challenges').findOne({ _id: user.id })).attempts, 1);
  const results = await Promise.allSettled([
    a.verification.verifyCode(user.id, { code }),
    b.verification.verifyCode(user.id, { code }),
  ]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal((await b.verification.status(user.id)).mobileVerified, true);
  assert.equal((await b.verification.status(user.id)).identityVerified, false);
  await assert.rejects(a.fleet.create({ role: 'owner', id: user.id }, fleetDetails()), {
    status: 409,
  });
  assert.ok(!JSON.stringify(await a.verification.status(user.id)).includes('hash'));
});
test('five wrong mobile codes lock a challenge; expired and delivery-unknown codes never verify', async () => {
  const { a } = await fixture(),
    user = (await a.registerUser(account())).user;
  let code;
  a.verification = new OwnerVerification(a, {
    secret: 'a-test-secret-of-at-least-32-characters',
    sms: {
      enabled: true,
      async send(phone, text) {
        code = text.match(/code is (\d{6})/)[1];
      },
    },
  });
  await a.verification.sendCode(user.id, { phone: user.phone, consent: true });
  for (let i = 0; i < 5; i++)
    await assert.rejects(
      a.verification.verifyCode(user.id, { code: code === '000000' ? '111111' : '000000' }),
      { status: 400 },
    );
  await assert.rejects(a.verification.verifyCode(user.id, { code }), { status: 400 });
  await a.c('mobile_challenges').updateOne({ _id: user.id }, { $set: { nextSendAt: 0 } });
  await a.verification.sendCode(user.id, { phone: user.phone, consent: true });
  await a.c('mobile_challenges').updateOne({ _id: user.id }, { $set: { expiresAt: new Date(0) } });
  await assert.rejects(a.verification.verifyCode(user.id, { code }), { status: 400 });
  await a.c('mobile_challenges').updateOne({ _id: user.id }, { $set: { nextSendAt: 0 } });
  a.verification.sms.send = async () => {
    throw new Error('private gateway detail');
  };
  await assert.rejects(a.verification.sendCode(user.id, { phone: user.phone, consent: true }), {
    status: 503,
  });
  assert.equal((await a.c('mobile_challenges').findOne({ _id: user.id })).hash, undefined);
});
test('identity verification binds trusted results to the owner and gates registration without storing Aadhaar data', async () => {
  const { a, b } = await fixture(),
    user = (await a.registerUser(account())).user;
  let request, result;
  const provider = {
    enabled: true,
    async start(input) {
      request = input;
      return { id: 'provider_session_123', url: 'https://verify.example.test/session/123' };
    },
    async result() {
      return result;
    },
  };
  a.verification = new OwnerVerification(a, { provider });
  b.verification = new OwnerVerification(b, { provider });
  await assert.rejects(
    a.verification.startIdentity(user.id, { method: 'aadhaar', consent: false }),
    { status: 400 },
  );
  await a.verification.startIdentity(user.id, { method: 'aadhaar', consent: true });
  result = {
    id: 'provider_session_123',
    subject: user.id,
    requestId: request.requestId,
    method: 'aadhaar',
    status: 'verified',
    name: user.name,
    consentVersion: 'owner-identity-v1',
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
    aadhaar: 'PRIVATE_FULL_AADHAAR',
    biometrics: 'PRIVATE_BIOMETRICS',
  };
  result.subject = 'different-user';
  await assert.rejects(b.verification.finishIdentity(user.id), { status: 409 });
  result.subject = user.id;
  result.name = 'Other Person';
  await assert.rejects(b.verification.finishIdentity(user.id), { status: 409 });
  result.name = user.name;
  await b.verification.finishIdentity(user.id);
  assert.equal((await a.verification.status(user.id)).identityVerified, true);
  assert.equal((await a.verification.status(user.id)).mobileVerified, false);
  const saved = await a.c('owner_verifications').findOne({ _id: user.id });
  assert.ok(!JSON.stringify(saved).includes('PRIVATE_'));
  await a
    .c('owner_verifications')
    .updateOne(
      { _id: user.id },
      { $set: { mobile: { phone: user.phone, expiresAt: new Date(Date.now() + 86400000) } } },
    );
  const boat = await a.fleet.create({ role: 'owner', id: user.id }, fleetDetails());
  assert.equal(boat.status, 'draft');
  await a
    .c('owner_verifications')
    .updateOne({ _id: user.id }, { $set: { 'identity.expiresAt': new Date(0) } });
  await assert.rejects(
    a.fleet.update(
      boat.id,
      { role: 'owner', id: user.id },
      { revision: boat.revision, details: boat.details },
    ),
    { status: 409 },
  );
});
test('verification HTTP endpoints require the customer session and reject client verification claims', async () => {
  const { a } = await fixture(),
    registered = await a.registerUser(account()),
    server = createApp(null, { repository: a });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port,
    base = '/api/owner/verification',
    headers = {
      Cookie: 'nautica_user=' + registered.token,
      Origin: origin,
      'Content-Type': 'application/json',
      'X-Nautica-Request': '1',
    };
  try {
    assert.equal((await fetch(origin + base)).status, 401);
    assert.equal(
      (await fetch(origin + base, { headers: { Cookie: 'nautica_admin=forged' } })).status,
      401,
    );
    const state = await (await fetch(origin + base, { headers })).json();
    assert.equal(state.identityVerified, false);
    assert.equal(state.mobileVerified, false);
    assert.equal(state.identityEnabled, false);
    assert.ok(!JSON.stringify(state).includes('hash'));
    const cross = await fetch(origin + base + '/mobile/send', {
      method: 'POST',
      headers: { ...headers, Origin: 'https://attacker.example' },
      body: JSON.stringify({ phone: registered.user.phone, consent: true }),
    });
    assert.equal(cross.status, 403);
    const claim = await fetch(origin + '/api/owner/boats', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        ...fleetDetails(),
        mobileVerified: true,
        identityVerified: true,
        verified: true,
      }),
    });
    assert.equal(claim.status, 409);
    const identity = await fetch(origin + base + '/identity/check', {
      method: 'POST',
      headers,
      body: JSON.stringify({ verified: true, subject: registered.user.id, providerId: 'forged' }),
    });
    assert.equal(identity.status, 503);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
test('legacy ownerless boats require an explicit verified owner link and fresh independent review', async () => {
  const { a, b } = await fixture(),
    id = 'BT-0123456789ABCDEF',
    original = await a.c('boats').findOne({ _id: 'b1' });
  await a.c('boats').insertOne({
    ...original,
    _id: id,
    ownerId: null,
    registrationKey: 'legacy-ownerless',
    createdBy: 'admin:legacy',
    revision: 1,
  });
  const actor = { role: 'admin', id: 'linker' },
    input = {
      revision: 1,
      ownerEmail: 'fixture-owner@example.test',
      declaration: true,
      notes: 'Ownership authority and verified account confirmed.',
    };
  await assert.rejects(a.fleet.assignOwner(id, { role: 'owner', id: 'fixture-owner' }, input), {
    status: 403,
  });
  await assert.rejects(a.fleet.assignOwner(id, actor, { ...input, declaration: false }), {
    status: 400,
  });
  const linked = await a.fleet.assignOwner(id, actor, input);
  assert.equal(linked.status, 'draft');
  assert.equal(linked.ownerId, 'fixture-owner');
  await assert.rejects(b.fleet.bookable(id, '2027-01-01'), { status: 409 });
  await assert.rejects(a.fleet.assignOwner(id, actor, { ...input, revision: linked.revision }), {
    status: 409,
  });
  const submitted = await a.fleet.submit(id, actor, {
    revision: linked.revision,
    declaration: true,
  });
  await assert.rejects(
    a.fleet.review(id, actor, { ...fleetReview, revision: submitted.revision }),
    { status: 403 },
  );
  const approved = await b.fleet.review(
    id,
    { role: 'admin', id: 'checker' },
    { ...fleetReview, revision: submitted.revision },
  );
  assert.equal(approved.status, 'approved');
});

// Financial workflows use fake provider transports; no live refunds or messages are sent.
async function paidAftercare() {
  const f = await fixture(),
    user = (await f.a.registerUser(account())).user,
    { gateway } = gatewayFixture(),
    payments = createPaymentService(new MongoPaymentStore(f.a), gateway),
    input = booking(user, { date: localDate(new Date(Date.now() + 3 * 86400000)) }),
    order = await payments.order(input, user),
    verify = {
      attemptId: order.attemptId,
      orderId: order.orderId,
      paymentId: 'pay_1',
      signature: sign(order.orderId + '|pay_1'),
    },
    pass = await payments.verify(verify, user);
  return { ...f, user, input, pass, payments, verify };
}
function refundGateway(amount = 126000) {
  const rows = [],
    requests = [],
    byKey = new Map();
  let failure = null;
  const gateway = {
    enabled: true,
    name: 'Razorpay',
    async getPayment(id) {
      const amountRefunded = rows
        .filter((row) => row.status === 'processed')
        .reduce((sum, row) => sum + row.amount, 0);
      return {
        id,
        amount,
        currency: 'INR',
        amountRefunded,
        status: amountRefunded === amount ? 'refunded' : 'captured',
      };
    },
    async listRefunds(id, skip) {
      return {
        items: structuredClone(rows.filter((row) => row.payment_id === id).slice(skip, skip + 100)),
      };
    },
    async createRefund(id, body, key) {
      requests.push({ id, body: structuredClone(body), key });
      if (failure === 'before') {
        failure = null;
        throw new Error('private transport detail');
      }
      let row = byKey.get(key);
      if (!row) {
        row = {
          id: 'rfnd_' + (rows.length + 1),
          payment_id: id,
          currency: 'INR',
          amount: body.amount,
          status: 'pending',
          notes: body.notes,
          receipt: body.receipt,
        };
        rows.push(row);
        byKey.set(key, row);
      }
      if (failure === 'after') {
        failure = null;
        throw new Error('private timeout detail');
      }
      return structuredClone(row);
    },
    async getRefund(id, refundId) {
      return structuredClone(rows.find((row) => row.payment_id === id && row.id === refundId));
    },
    async fetchRefund(refundId) {
      return structuredClone(rows.find((row) => row.id === refundId));
    },
  };
  return {
    gateway,
    rows,
    requests,
    fail: (mode) => {
      failure = mode;
    },
  };
}
test('cancellation requests keep seats until approval, enforce ownership/cutoff and release only the cancelled booking', async () => {
  const { a, b, user, input, pass } = await paidAftercare(),
    stranger = (await a.registerUser(account())).user;
  await assert.rejects(
    a.cancellations.request(pass.id, stranger, {
      reason: 'Please cancel my journey.',
      acceptPolicy: true,
    }),
    { status: 404 },
  );
  await assert.rejects(
    a.cancellations.request(pass.id, user, {
      reason: 'Please cancel my journey.',
      acceptPolicy: false,
    }),
    { status: 400 },
  );
  const soon = await a.createBooking(booking(user, { seats: ['03'] }), 'seats', user);
  await a
    .c('bookings')
    .updateOne(
      { _id: soon.id },
      { $set: { cancellationPolicy: { version: 'test', cutoffHours: 1000 } } },
    );
  await assert.rejects(
    a.cancellations.request(soon.id, user, {
      reason: 'Please cancel this journey.',
      acceptPolicy: true,
    }),
    { status: 409 },
  );
  const other = await a.createBooking(
    { ...input, seats: ['02'], requestKey: randomUUID() },
    'seats',
    user,
  );
  const requested = await a.cancellations.request(pass.id, user, {
    reason: 'Our travel plans have changed.',
    acceptPolicy: true,
  });
  assert.equal(requested.status, 'requested');
  assert.deepEqual((await b.availability(input)).bookedSeats, ['01', '02']);
  assert.equal(await a.c('refunds').countDocuments({}), 0);
  await a.cancellations.decide(pass.id, 'reviewer', {
    action: 'reject',
    revision: requested.revision,
    reason: 'Please confirm the requested booking details.',
  });
  assert.equal((await b.userBooking(user.id, pass.id)).status, 'confirmed');
  const again = await b.cancellations.request(pass.id, user, {
    reason: 'The booking details are correct; please cancel.',
    acceptPolicy: true,
  });
  await assert.rejects(
    a.cancellations.decide(pass.id, 'reviewer', {
      action: 'approve',
      revision: requested.revision,
      reason: 'Full refund approved after review.',
    }),
    { status: 409 },
  );
  await a.cancellations.decide(pass.id, 'reviewer', {
    action: 'approve',
    revision: again.revision,
    reason: 'Full refund approved after review.',
  });
  assert.deepEqual((await b.availability(input)).bookedSeats, ['02']);
  assert.equal((await b.userBooking(user.id, other.id)).status, 'confirmed');
  const cancelled = await b.userBooking(user.id, pass.id);
  assert.equal(cancelled.status, 'cancelled');
  assert.equal(cancelled.pass.bookingStatus, 'cancelled');
  assert.equal(cancelled.payment.status, 'refund_pending');
  assert.equal(cancelled.cancellation.refund.amount, 126000);
});
test('concurrent cancellation approvals create one refund, and replay cannot release resold seats or resurrect tickets', async () => {
  const { a, b, user, input, pass, payments, verify } = await paidAftercare();
  const asked = await a.cancellations.request(pass.id, user, {
      reason: 'Travel plans changed; please cancel.',
      acceptPolicy: true,
    }),
    action = {
      action: 'approve',
      revision: asked.revision,
      reason: 'Cancellation and full refund approved.',
    };
  await Promise.all([
    a.cancellations.decide(pass.id, 'one', action),
    b.cancellations.decide(pass.id, 'two', action),
  ]);
  assert.equal(await a.c('refunds').countDocuments({}), 1);
  const replacement = await b.createBooking({ ...input, requestKey: randomUUID() }, 'seats', user);
  await a.cancellations.decide(pass.id, 'one', action);
  assert.deepEqual((await b.availability(input)).bookedSeats, ['01']);
  assert.equal(
    (await a.c('inventory').findOne({ boatId: input.boatId, date: input.date })).occupied['01']
      .bookingId,
    replacement.id,
  );
  assert.equal((await payments.verify(verify, user)).bookingStatus, 'cancelled');
  assert.equal((await a.createBooking(input, 'seats', user)).bookingStatus, 'cancelled');
  assert.equal(await a.c('bookings').countDocuments({}), 2);
});
test('refund workers coordinate across replicas and mark money returned only after provider confirmation', async () => {
  const { a, b, user, pass } = await paidAftercare(),
    fake = refundGateway();
  await a.cancellations.decide(pass.id, 'admin', {
    action: 'cancel',
    revision: 0,
    reason: 'Operator cancelled due to unsafe weather.',
  });
  const [row] = await a.c('refunds').find({}).toArray();
  const wa = new Refunds(a, fake.gateway),
    wb = new Refunds(b, fake.gateway);
  await Promise.all([wa.drain(), wb.drain()]);
  assert.equal(fake.requests.length, 1);
  assert.equal((await b.c('refunds').findOne({ _id: row._id })).status, 'pending');
  assert.equal((await b.userBooking(user.id, pass.id)).payment.status, 'refund_pending');
  fake.rows[0].status = 'processed';
  fake.rows[0].acquirer_data = { arn: 'ARN_TEST_123' };
  await Promise.all([wa.reconcile(row._id, 'admin'), wb.reconcile(row._id, 'admin')]);
  const view = await b.userBooking(user.id, pass.id);
  assert.equal(view.payment.status, 'refunded');
  assert.equal(view.cancellation.refund.bankReference, 'ARN_TEST_123');
  assert.equal((await b.userPayments(user.id)).payments[0].refund.status, 'processed');
  assert.equal(
    await a.c('outbox').countDocuments({ bookingId: pass.id, event: 'refund-1-processed' }),
    2,
  );
  await wa.apply(row._id, { ...fake.rows[0], status: 'pending' });
  assert.equal((await b.c('payments').findOne({ bookingId: pass.id })).status, 'refunded');
});
test('a lost refund response is reconciled read-only; explicit transport retry preserves key and body', async () => {
  const { a, b, user, pass } = await paidAftercare(),
    fake = refundGateway();
  await a.cancellations.decide(pass.id, 'admin', {
    action: 'cancel',
    revision: 0,
    reason: 'Operator cancellation after safety review.',
  });
  const row = await a.c('refunds').findOne({}),
    worker = new Refunds(a, fake.gateway);
  fake.fail('after');
  await worker.drain();
  assert.equal((await b.c('refunds').findOne({ _id: row._id })).status, 'unknown');
  assert.equal((await b.userBooking(user.id, pass.id)).cancellation.refund.status, 'unknown');
  await worker.reconcile(row._id, 'admin');
  assert.equal(fake.requests.length, 1);
  assert.equal((await b.c('refunds').findOne({ _id: row._id })).status, 'pending');
  const next = await paidAftercare(),
    second = refundGateway();
  await next.a.cancellations.decide(next.pass.id, 'admin', {
    action: 'cancel',
    revision: 0,
    reason: 'Operator cancellation after safety review.',
  });
  const secondRow = await next.a.c('refunds').findOne({}),
    secondWorker = new Refunds(next.a, second.gateway);
  second.fail('before');
  await secondWorker.drain();
  await secondWorker.retry(secondRow._id, 'admin', {
    reason: 'Readback found no refund; retry same request.',
  });
  await secondWorker.drain();
  assert.equal(second.requests.length, 2);
  assert.equal(second.requests[0].key, second.requests[1].key);
  assert.deepEqual(second.requests[0].body, second.requests[1].body);
});
test('demo cancellation records a simulated refund and never makes a provider refund request', async () => {
  const { a } = await fixture(),
    user = (await a.registerUser(account())).user,
    input = booking(user, { date: localDate(new Date(Date.now() + 3 * 86400000)) }),
    pass = await a.createBooking(input, 'private', user),
    fake = refundGateway();
  const asked = await a.cancellations.request(pass.id, user, {
    reason: 'Please cancel this demonstration booking.',
    acceptPolicy: true,
  });
  await a.cancellations.decide(pass.id, 'admin', {
    action: 'approve',
    revision: asked.revision,
    reason: 'Demonstration cancellation approved.',
  });
  await new Refunds(a, fake.gateway).drain();
  assert.equal(fake.requests.length, 0);
  assert.deepEqual((await a.availability(input)).bookedSeats, []);
  assert.equal((await a.userBooking(user.id, pass.id)).payment.status, 'demo_refunded');
  assert.equal((await a.c('refunds').findOne({})).status, 'simulated');
});
test('unbooked captured payments can be refunded without creating a journey or accepting late callbacks', async () => {
  const { a, b } = await fixture(),
    user = (await a.registerUser(account())).user,
    { gateway } = gatewayFixture(),
    payments = createPaymentService(new MongoPaymentStore(a), gateway),
    input = booking(user),
    order = await payments.order(input, user);
  await a.c('boats').updateOne({ _id: 'b1' }, { $set: { status: 'suspended' } });
  const verify = {
    attemptId: order.attemptId,
    orderId: order.orderId,
    paymentId: 'pay_1',
    signature: sign(order.orderId + '|pay_1'),
  };
  await assert.rejects(payments.verify(verify, user), { status: 409 });
  const refund = await a.cancellations.refundUnbooked(order.attemptId, 'admin', {
      reason: 'Payment captured without an eligible boat.',
    }),
    fake = refundGateway(),
    worker = new Refunds(b, fake.gateway);
  await worker.drain();
  fake.rows[0].status = 'processed';
  await worker.reconcile(refund.id, 'admin');
  assert.equal((await b.userPayments(user.id)).payments[0].status, 'refunded');
  assert.equal((await b.c('inventory').findOne({ boatId: 'b1' })).occupied['01'], undefined);
  const raw = JSON.stringify({
    event: 'payment.captured',
    payload: { payment: { entity: { id: 'pay_1', order_id: order.orderId } } },
  });
  await payments.webhook(raw, sign(raw, 'test-webhook'));
  assert.equal((await a.c('payments').findOne({ _id: order.attemptId })).status, 'refunded');
  assert.equal(await a.c('bookings').countDocuments({}), 0);
});
test('external full refunds are adopted without issuing another refund; partial evidence needs manual review', async () => {
  const { a, pass, user } = await paidAftercare(),
    fake = refundGateway();
  await a.cancellations.decide(pass.id, 'admin', {
    action: 'cancel',
    revision: 0,
    reason: 'Full cancellation approved after review.',
  });
  fake.rows.push({
    id: 'rfnd_EXTERNAL',
    payment_id: 'pay_1',
    amount: 126000,
    currency: 'INR',
    status: 'processed',
  });
  const worker = new Refunds(a, fake.gateway);
  await worker.drain();
  assert.equal(fake.requests.length, 0);
  assert.equal((await a.userBooking(user.id, pass.id)).payment.status, 'refunded');
  const next = await paidAftercare(),
    partial = refundGateway();
  await next.a.cancellations.decide(next.pass.id, 'admin', {
    action: 'cancel',
    revision: 0,
    reason: 'Full cancellation approved after review.',
  });
  partial.rows.push({
    id: 'rfnd_PARTIAL',
    payment_id: 'pay_1',
    amount: 50000,
    currency: 'INR',
    status: 'processed',
  });
  await new Refunds(next.a, partial.gateway).drain();
  assert.equal(partial.requests.length, 0);
  assert.equal((await next.a.c('refunds').findOne({})).status, 'manual_review');
  assert.equal(
    (await next.a.userBooking(next.user.id, next.pass.id)).payment.status,
    'refund_attention',
  );
});
test('document reminder milestones deduplicate across workers and suppress replaced or stale notices', async () => {
  const { a, b } = await fixture(),
    user = (await a.registerUser(account())).user,
    actor = { role: 'owner', id: user.id },
    boat = await documented(a, actor),
    id = boat.id,
    expiresOn = '2027-01-31',
    doc = boat.documents.insurance;
  await a
    .c('boats')
    .updateOne({ _id: id }, { $set: { 'documents.insurance.expiresOn': expiresOn } });
  a.smsEnabled = true;
  a.smsAdminEnabled = true;
  b.smsEnabled = true;
  b.smsAdminEnabled = true;
  const now = new Date('2027-01-01T05:00:00Z');
  const runs = await Promise.all([a.reminders.run(now), b.reminders.run(now)]);
  assert.equal(runs.filter((run) => run.claimed).length, 1);
  assert.equal(await a.c('outbox').countDocuments({ boatId: id, event: 'document_expiry' }), 2);
  assert.equal(await a.c('sms_outbox').countDocuments({ boatId: id }), 2);
  await Promise.all([
    a.reminders.queue(id, 'insurance', now),
    b.reminders.queue(id, 'insurance', now),
  ]);
  assert.equal(await a.c('outbox').countDocuments({ boatId: id }), 2);
  await a.reminders.queue(id, 'insurance', new Date('2027-01-17T05:00:00Z'));
  assert.equal(await a.c('outbox').countDocuments({ boatId: id }), 4);
  const early = await a.c('outbox').findOne({ boatId: id, 'notice.document.stage': '30' });
  assert.equal(await a.reminders.current(early.notice, new Date('2027-01-17T05:00:00Z')), false);
  const ownerState = await a.reminders.status(id, actor);
  assert.ok(ownerState.notifications.every((job) => job.audience === 'owner'));
  await assert.rejects(a.reminders.status(id, { role: 'owner', id: 'stranger' }), { status: 404 });
  const latest = await a.c('outbox').findOne({ boatId: id, 'notice.document.stage': '14' });
  await a.c('boats').updateOne(
    { _id: id },
    {
      $set: {
        'documents.insurance.id': randomUUID(),
        'documents.insurance.expiresOn': '2028-01-01',
      },
    },
  );
  assert.equal(await b.reminders.current(latest.notice, new Date('2027-01-17T05:00:00Z')), false);
  assert.ok(!JSON.stringify(latest.notice).includes(doc.number));
  await assert.rejects(a.reminders.retry(id, actor), { status: 403 });
});
test('reminders recover after a missed milestone and emit one expired notice per document version', async () => {
  const { a } = await fixture(),
    actor = { role: 'owner', id: (await a.registerUser(account())).user.id },
    boat = await documented(a, actor),
    expiresOn = '2027-02-01';
  await a
    .c('boats')
    .updateOne({ _id: boat.id }, { $set: { 'documents.registration.expiresOn': expiresOn } });
  await a.reminders.queue(boat.id, 'registration', new Date('2027-01-23T05:00:00Z'));
  assert.equal((await a.c('outbox').findOne({ boatId: boat.id })).notice.document.stage, '14');
  await a.reminders.queue(boat.id, 'registration', new Date('2027-02-02T05:00:00Z'));
  await a.reminders.queue(boat.id, 'registration', new Date('2027-02-10T05:00:00Z'));
  assert.equal(
    await a.c('outbox').countDocuments({ boatId: boat.id, 'notice.document.stage': 'expired' }),
    2,
  );
});
test('failed refunds require explicit review, use a new generation, and stale evidence cannot overwrite a retry', async () => {
  const { a, b, pass, user } = await paidAftercare(),
    fake = refundGateway(),
    worker = new Refunds(a, fake.gateway);
  await a.cancellations.decide(pass.id, 'admin', {
    action: 'cancel',
    revision: 0,
    reason: 'Operator cancellation after safety review.',
  });
  await worker.drain();
  const row = await a.c('refunds').findOne({});
  fake.rows[0].status = 'failed';
  await worker.reconcile(row._id, 'admin');
  assert.equal((await b.userBooking(user.id, pass.id)).payment.status, 'refund_failed');
  await worker.retry(row._id, 'admin', {
    reason: 'Provider confirms final failure; retry approved.',
  });
  assert.equal((await b.c('refunds').findOne({ _id: row._id })).generation, 2);
  await worker.apply(row._id, fake.rows[0], { generation: 1 });
  assert.equal((await b.c('refunds').findOne({ _id: row._id })).status, 'queued');
  await worker.drain();
  assert.equal(fake.requests.length, 2);
  assert.notEqual(fake.requests[0].key, fake.requests[1].key);
  fake.rows[1].status = 'processed';
  await worker.webhook(fake.rows[1].id);
  const completed = await b.c('refunds').findOne({ _id: row._id });
  assert.equal(completed.status, 'processed');
  const processedAt = completed.processedAt;
  fake.rows[1].acquirer_data = { rrn: 'RRN_LATE_123' };
  await worker.reconcile(row._id, 'admin');
  assert.equal((await b.c('refunds').findOne({ _id: row._id })).processedAt, processedAt);
  assert.equal(
    (await b.userBooking(user.id, pass.id)).cancellation.refund.bankReference,
    'RRN_LATE_123',
  );
});
test('provider evidence must match the full payment; old uncertainty cannot authorize a new refund', async () => {
  const { a, pass } = await paidAftercare(),
    fake = refundGateway(),
    worker = new Refunds(a, fake.gateway);
  await a.cancellations.decide(pass.id, 'admin', {
    action: 'cancel',
    revision: 0,
    reason: 'Operator cancelled the journey for safety.',
  });
  fake.fail('before');
  await worker.drain();
  const row = await a.c('refunds').findOne({});
  fake.rows.push({
    id: 'rfnd_WRONG',
    payment_id: 'pay_another',
    amount: 126000,
    currency: 'INR',
    status: 'processed',
  });
  await assert.rejects(
    worker.reconcile(row._id, 'admin', {
      providerRefundId: 'rfnd_WRONG',
      reason: 'Checking the supplied provider reference.',
    }),
    { status: 409 },
  );
  assert.equal((await a.c('refunds').findOne({ _id: row._id })).status, 'unknown');
  await a
    .c('refunds')
    .updateOne({ _id: row._id }, { $set: { firstAttemptAt: new Date(Date.now() - 2 * 86400000) } });
  await assert.rejects(
    worker.retry(row._id, 'admin', { reason: 'Trying to repeat an old uncertain request.' }),
    { status: 409 },
  );
  assert.equal(fake.requests.length, 1);
});
test('aftercare HTTP routes enforce admin/customer roles, origin, amount integrity and current ticket validity', async () => {
  const { a, user, pass, input } = await paidAftercare(),
    fake = refundGateway(),
    worker = new Refunds(a, fake.gateway);
  await a.setAdmin('aftercare-admin', 'aftercare-admin-password');
  const admin = await fullAdminLogin(a, 'aftercare-admin', 'aftercare-admin-password'),
    customer = await a.loginUser({ email: user.email, password: 'strong-test-passphrase' }),
    snapshot = await a.c('bookings').findOne({ _id: pass.id });
  const boardTime = +journeyEnd(snapshot) - 3600000 - 900000,
    server = createApp(null, { repository: a, refunds: worker, clock: () => boardTime });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port,
    headers = { Origin: origin, 'Content-Type': 'application/json', 'X-Nautica-Request': '1' },
    userCookie = 'nautica_user=' + customer.token,
    adminCookie = 'nautica_admin=' + admin.token;
  const post = (path, body, cookie = adminCookie, custom = {}) =>
    fetch(origin + path, {
      method: 'POST',
      headers: { ...headers, Cookie: cookie, ...custom },
      body: JSON.stringify(body),
    });
  try {
    assert.equal(
      (await fetch(origin + '/api/admin/refunds', { headers: { Cookie: userCookie } })).status,
      401,
    );
    assert.equal(
      (
        await post(
          '/api/admin/bookings/' + pass.id + '/cancellation',
          { action: 'cancel', revision: 0, reason: 'Forged approval should be rejected.' },
          userCookie,
        )
      ).status,
      401,
    );
    const board = { bookingId: pass.id, boatId: input.boatId, date: input.date, slot: input.slot };
    assert.equal((await (await post('/api/admin/boarding/verify', board)).json()).valid, true);
    const customerRequest = await post(
      '/api/user/bookings/' + pass.id + '/cancellation',
      { reason: 'Please cancel our upcoming journey.', acceptPolicy: true },
      userCookie,
    );
    assert.equal(customerRequest.status, 200);
    const asked = (await customerRequest.json()).cancellation;
    assert.equal((await (await post('/api/admin/boarding/verify', board)).json()).valid, false);
    assert.equal(
      (
        await post(
          '/api/admin/bookings/' + pass.id + '/cancellation',
          {
            action: 'approve',
            revision: asked.revision,
            reason: 'Full refund approved after review.',
          },
          adminCookie,
          { Origin: 'https://attacker.test' },
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await post('/api/admin/bookings/' + pass.id + '/cancellation', {
          action: 'approve',
          revision: asked.revision,
          reason: 'Full refund approved after review.',
          amount: 1,
          currency: 'USD',
        })
      ).status,
      200,
    );
    assert.equal((await a.c('refunds').findOne({})).amount, 126000);
    assert.equal((await (await post('/api/admin/boarding/verify', board)).json()).valid, false);
    const row = await a.c('refunds').findOne({});
    const audit = await fetch(origin + '/api/admin/refunds/' + row._id + '/audit', {
      headers: { Cookie: adminCookie },
    });
    assert.equal(audit.status, 200);
    assert.ok((await audit.json()).audit.some((event) => event.action === 'booking_cancelled'));
    assert.equal(
      (
        await fetch(origin + '/api/admin/refunds/' + row._id + '/audit', {
          headers: { Cookie: userCookie },
        })
      ).status,
      401,
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
test('document notices send through SMTP/TextBee to current owner/admin contacts and suppress superseded jobs', async () => {
  const { a } = await fixture(),
    user = (await a.registerUser(account())).user,
    boat = await documented(a, { role: 'owner', id: user.id }),
    expires = reminderDate(new Date(Date.now() + 7 * 86400000));
  a.smsEnabled = true;
  a.smsAdminEnabled = true;
  await a
    .c('boats')
    .updateOne({ _id: boat.id }, { $set: { 'documents.insurance.expiresOn': expires } });
  await a.reminders.queue(boat.id, 'insurance');
  await a.c('users').updateOne({ _id: user.id }, { $set: { phone: '+919876543211' } });
  const emails = [],
    sms = [],
    email = createSharedEmailService(new MongoOutboxStore(a), {
      config: { configured: true, user: 'sender@example.test', adminTo: 'admin@example.test' },
      transport: {
        async sendMail(message) {
          emails.push(message);
          return { accepted: [message.to.address] };
        },
      },
    }),
    gateway = {
      enabled: true,
      config: { adminTo: '+919876543212', countryCode: '91', deviceId: 'a'.repeat(24) },
      async send(phone, message) {
        sms.push({ phone, message });
        return { batchId: 'b'.repeat(24) };
      },
    };
  const service = createSmsService(new MongoSmsStore(a), gateway);
  try {
    await Promise.all([email.drain(), service.drain()]);
    assert.equal(emails.length, 2);
    assert.ok(emails.some((message) => message.to.address === user.email));
    assert.ok(emails.some((message) => message.to.address === 'admin@example.test'));
    assert.ok(sms.some((message) => message.phone === '+919876543211'));
    assert.ok(sms.some((message) => message.phone === '+919876543212'));
    assert.ok(!emails.some((message) => message.text.includes(boat.documents.insurance.number)));
    await a
      .c('outbox')
      .updateMany(
        { boatId: boat.id },
        { $set: { status: 'pending', attempts: 0, nextAttemptAt: 0 } },
      );
    await a
      .c('boats')
      .updateOne({ _id: boat.id }, { $set: { 'documents.insurance.id': randomUUID() } });
    await email.drain();
    assert.equal(emails.length, 2);
    assert.equal(await a.c('outbox').countDocuments({ boatId: boat.id, status: 'suppressed' }), 2);
  } finally {
    await email.stop();
    await service.stop();
  }
});
test('document renewals can be staged with upcoming bookings and only an independent review publishes them', async () => {
  const { a, b } = await fixture(),
    user = (await a.registerUser(account())).user,
    actor = { role: 'owner', id: user.id },
    reviewer = { role: 'admin', id: 'checker' };
  let boat = await documented(a, actor);
  boat = await a.fleet.submit(boat.id, actor, { revision: boat.revision, declaration: true });
  boat = await a.fleet.review(boat.id, reviewer, { ...fleetReview, revision: boat.revision });
  const oldExpiry = reminderDate(new Date(Date.now() + 7 * 86400000));
  await a
    .c('boats')
    .updateOne({ _id: boat.id }, { $set: { 'documents.insurance.expiresOn': oldExpiry } });
  const pass = await a.createBooking(
      booking(user, { boatId: boat.id, date: localDate(new Date(Date.now() + 3 * 86400000)) }),
      'seats',
      user,
    ),
    oldId = boat.documents.insurance.id;
  const payload = {
    category: 'insurance',
    number: 'RENEWED-INSURANCE',
    issuer: 'Insurance issuer',
    issuedOn: reminderDate(),
    expiresOn: reminderDate(new Date(Date.now() + 365 * 86400000)),
    mime: 'application/pdf',
    data: pdf.toString('base64'),
    revision: boat.revision,
    declaration: true,
  };
  await assert.rejects(a.fleet.upload(boat.id, actor, { ...payload, declaration: false }), {
    status: 400,
  });
  boat = await a.fleet.upload(boat.id, actor, payload);
  assert.equal(boat.status, 'approved');
  assert.equal(boat.documents.insurance.id, oldId);
  assert.notEqual(boat.pendingDocuments.insurance.id, oldId);
  assert.ok((await b.fleet.catalog()).boats.some((item) => item.id === boat.id));
  assert.equal((await b.userBooking(user.id, pass.id)).status, 'confirmed');
  await assert.rejects(
    b.fleet.reviewRenewals(boat.id, actor, { ...fleetReview, revision: boat.revision }),
    { status: 403 },
  );
  await assert.rejects(
    b.fleet.reviewRenewals(boat.id, reviewer, {
      ...fleetReview,
      checks: {},
      revision: boat.revision,
    }),
    { status: 400 },
  );
  const newId = boat.pendingDocuments.insurance.id;
  boat = await b.fleet.reviewRenewals(boat.id, reviewer, {
    ...fleetReview,
    revision: boat.revision,
  });
  assert.equal(boat.documents.insurance.id, newId);
  assert.equal(Object.keys(boat.pendingDocuments).length, 0);
  assert.equal((await b.userBooking(user.id, pass.id)).status, 'confirmed');
  assert.ok(!JSON.stringify(await b.fleet.catalog()).includes('RENEWED-INSURANCE'));
});
test('historical unverified payments never initiate an automated refund merely because an admin retries', async () => {
  const { a, pass } = await paidAftercare();
  await a
    .c('payments')
    .updateOne({ bookingId: pass.id }, { $set: { verification: 'historical_record' } });
  await a.cancellations.decide(pass.id, 'admin', {
    action: 'cancel',
    revision: 0,
    reason: 'Historical payment needs operational reconciliation.',
  });
  const row = await a.c('refunds').findOne({}),
    fake = refundGateway(),
    worker = new Refunds(a, fake.gateway);
  assert.equal(row.status, 'manual_review');
  await assert.rejects(
    worker.retry(row._id, 'admin', { reason: 'Reviewing the historical payment evidence.' }),
    { status: 409 },
  );
  await worker.drain();
  assert.equal(fake.requests.length, 0);
});
test('customers can withdraw pending requests, and a concurrent approval cannot restore a cancelled ticket', async () => {
  const { a, b, user, input, pass } = await paidAftercare(),
    request = { reason: 'Our plans changed; please cancel.', acceptPolicy: true };
  let asked = await a.cancellations.request(pass.id, user, request);
  assert.equal((await b.userBooking(user.id, pass.id)).pass.cancellationPending, true);
  const withdrawn = await b.cancellations.withdraw(pass.id, user, { revision: asked.revision });
  assert.equal(withdrawn.status, 'withdrawn');
  assert.equal((await a.userBooking(user.id, pass.id)).pass.cancellationPending, false);
  assert.deepEqual((await a.availability(input)).bookedSeats, ['01']);
  asked = await a.cancellations.request(pass.id, user, request);
  const results = await Promise.allSettled([
    a.cancellations.withdraw(pass.id, user, { revision: asked.revision }),
    b.cancellations.decide(pass.id, 'admin', {
      action: 'approve',
      revision: asked.revision,
      reason: 'Eligible full refund approved after review.',
    }),
  ]);
  assert.equal(results.filter((row) => row.status === 'fulfilled').length, 1);
  const current = await a.userBooking(user.id, pass.id);
  assert.equal(await b.c('refunds').countDocuments({}), current.status === 'cancelled' ? 1 : 0);
  assert.equal(current.pass.cancellationPending, false);
  assert.deepEqual(
    (await a.availability(input)).bookedSeats,
    current.status === 'cancelled' ? [] : ['01'],
  );
});

async function fullAdminLogin(repo, username, password) {
  repo.mfa = new AdminMfa(repo, { key: '0123456789abcdef'.repeat(4) });
  const admin = await repo.c('admins').findOne({ _id: username });
  if (!admin.mfa && !admin.mfaEnrollmentAllowed) await repo.mfa.reset(username, password);
  const start = await repo.loginAdmin(username, password),
    setup = await repo.mfa.setup(start.challengeToken);
  return repo.mfa.verify(start.challengeToken, {
    code: totp(setup.secret, Math.floor(Date.now() / 30000)),
  });
}
test('admin passwords only issue a restricted challenge; enrollment creates encrypted MFA and revokes legacy sessions', async () => {
  const { a, b } = await fixture();
  await a.setAdmin('secure-admin', 'secure-admin-password');
  await a.c('sessions').insertOne({
    _id: 'legacy',
    role: 'admin',
    userId: 'secure-admin',
    version: 1,
    expiresAt: new Date(Date.now() + 3600000),
  });
  const begin = await a.loginAdmin('secure-admin', 'secure-admin-password');
  assert.equal(begin.mfaRequired, true);
  assert.equal(begin.token, undefined);
  const setup = await b.mfa.setup(begin.challengeToken),
    codes = await a.mfa.verify(begin.challengeToken, {
      code: totp(setup.secret, Math.floor(Date.now() / 30000)),
    });
  assert.equal(await b.authenticateAdmin(codes.token), 'secure-admin');
  assert.equal(codes.recoveryCodes.length, 8);
  const stored = await a.c('admins').findOne({ _id: 'secure-admin' });
  assert.ok(!JSON.stringify(stored).includes(setup.secret));
  assert.ok(!JSON.stringify(stored).includes(codes.recoveryCodes[0]));
  assert.equal(await a.c('sessions').countDocuments({ _id: 'legacy' }), 0);
  await assert.rejects(a.mfa.verify(begin.challengeToken, { code: '123456' }), { status: 401 });
  const next = await b.loginAdmin('secure-admin', 'secure-admin-password');
  assert.equal(next.enrollmentRequired, false);
  await assert.rejects(
    a.mfa.verify(next.challengeToken, { code: totp(setup.secret, stored.mfa.lastStep) }),
    { status: 401 },
  );
  const recovered = await b.mfa.verify(next.challengeToken, { code: codes.recoveryCodes[0] });
  assert.equal(await a.authenticateAdmin(recovered.token), 'secure-admin');
  const third = await a.loginAdmin('secure-admin', 'secure-admin-password');
  await assert.rejects(b.mfa.verify(third.challengeToken, { code: codes.recoveryCodes[0] }), {
    status: 401,
  });
  assert.equal((await a.mfa.status('secure-admin')).recoveryCodesRemaining, 7);
});
test('wrong MFA attempts commit their budget and recovery codes cannot be consumed concurrently', async () => {
  const { a, b } = await fixture();
  await a.setAdmin('secure-admin', 'secure-admin-password');
  const start = await a.loginAdmin('secure-admin', 'secure-admin-password'),
    setup = await a.mfa.setup(start.challengeToken),
    login = await a.mfa.verify(start.challengeToken, {
      code: totp(setup.secret, Math.floor(Date.now() / 30000)),
    });
  const challenge = await a.loginAdmin('secure-admin', 'secure-admin-password');
  for (let i = 0; i < 5; i++)
    await assert.rejects(b.mfa.verify(challenge.challengeToken, { code: 'not-a-code' }), {
      status: 401,
    });
  assert.equal(
    (await a.c('admin_challenges').findOne({ _id: digest(challenge.challengeToken) })).attempts,
    5,
  );
  await assert.rejects(a.mfa.verify(challenge.challengeToken, { code: login.recoveryCodes[0] }), {
    status: 401,
  });
  const c1 = await a.loginAdmin('secure-admin', 'secure-admin-password'),
    c2 = await b.loginAdmin('secure-admin', 'secure-admin-password');
  const result = await Promise.allSettled([
    a.mfa.verify(c1.challengeToken, { code: login.recoveryCodes[1] }),
    b.mfa.verify(c2.challengeToken, { code: login.recoveryCodes[1] }),
  ]);
  assert.equal(result.filter((row) => row.status === 'fulfilled').length, 1);
  await a.mfa.reset('secure-admin', 'secure-admin-password');
  await assert.rejects(b.authenticateAdmin(login.token), { status: 401 });
  assert.equal(
    (await a.loginAdmin('secure-admin', 'secure-admin-password')).enrollmentRequired,
    true,
  );
});
test('legacy admins need console-authorized enrollment, and MFA encryption failure never grants access', async () => {
  const { a } = await fixture();
  await a.setAdmin('legacy-admin', 'legacy-admin-password');
  await a.c('admins').updateOne({ _id: 'legacy-admin' }, { $unset: { mfaEnrollmentAllowed: '' } });
  await assert.rejects(a.loginAdmin('legacy-admin', 'legacy-admin-password'), { status: 403 });
  await a.mfa.reset('legacy-admin', 'legacy-admin-password');
  const begin = await a.loginAdmin('legacy-admin', 'legacy-admin-password'),
    setup = await a.mfa.setup(begin.challengeToken),
    login = await a.mfa.verify(begin.challengeToken, {
      code: totp(setup.secret, Math.floor(Date.now() / 30000)),
    });
  a.mfa = new AdminMfa(a, { key: 'f'.repeat(64) });
  await assert.rejects(a.authenticateAdmin(login.token), { status: 503 });
});
test('MFA HTTP challenge cookies cannot authorize admin APIs and setup/verify obey origin checks', async () => {
  const { a } = await fixture();
  await a.setAdmin('secure-admin', 'secure-admin-password');
  const server = createApp(null, { repository: a });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port,
    headers = { Origin: origin, 'Content-Type': 'application/json', 'X-Nautica-Request': '1' };
  const post = (path, body, cookie = '', extra = {}) =>
    fetch(origin + path, {
      method: 'POST',
      headers: { ...headers, Cookie: cookie, ...extra },
      body: JSON.stringify(body),
    });
  try {
    const login = await post('/api/admin/login', {
        username: 'secure-admin',
        password: 'secure-admin-password',
      }),
      payload = await login.json();
    assert.equal(payload.mfaRequired, true);
    assert.equal(payload.challengeToken, undefined);
    const cookie = login.headers
      .getSetCookie()
      .find((value) => value.startsWith('nautica_admin_step='))
      .split(';')[0];
    assert.match(cookie, /^nautica_admin_step=[a-f0-9]{64}$/);
    assert.equal(
      (await fetch(origin + '/api/admin/bookings', { headers: { Cookie: cookie } })).status,
      401,
    );
    assert.equal(
      (await post('/api/admin/mfa/setup', {}, cookie, { Origin: 'https://attacker.test' })).status,
      403,
    );
    const setup = await (await post('/api/admin/mfa/setup', {}, cookie)).json(),
      verified = await post(
        '/api/admin/mfa/verify',
        { code: totp(setup.secret, Math.floor(Date.now() / 30000)) },
        cookie,
      );
    assert.equal(verified.status, 200);
    const adminCookie = verified.headers
      .getSetCookie()
      .find((value) => value.startsWith('nautica_admin='))
      .split(';')[0];
    assert.equal(
      (await fetch(origin + '/api/admin/operations', { headers: { Cookie: adminCookie } })).status,
      200,
    );
    assert.equal(
      (await fetch(origin + '/api/admin/operations', { headers: { Cookie: cookie } })).status,
      401,
    );
    assert.equal((await post('/api/admin/mfa/verify', { code: '000000' }, cookie)).status, 401);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
test('operational incidents deduplicate across replicas, preserve acknowledgement and reopen in a new episode', async () => {
  const { a, b } = await fixture();
  const results = await Promise.all([
    a.ops.observe('payment_attention', 'payment_attention', 2),
    b.ops.observe('payment_attention', 'payment_attention', 2),
  ]);
  assert.equal(await a.c('outbox').countDocuments({ event: 'operational_alert' }), 1);
  let row = await a.c('operational_alerts').findOne({ _id: 'payment_attention' });
  await a.ops.acknowledge(row._id, 'secure-admin', { revision: row.revision });
  await b.ops.observe(row._id, 'payment_attention', 3);
  row = await a.c('operational_alerts').findOne({ _id: row._id });
  assert.equal(row.status, 'acknowledged');
  assert.equal(await a.c('outbox').countDocuments({ event: 'operational_alert' }), 1);
  await a.ops.observe(row._id, 'payment_attention', 0);
  assert.equal((await a.c('operational_alerts').findOne({ _id: row._id })).status, 'resolved');
  await b.ops.observe(row._id, 'payment_attention', 1);
  assert.equal((await a.c('operational_alerts').findOne({ _id: row._id })).episode, 2);
  assert.equal(await a.c('outbox').countDocuments({ event: 'operational_alert' }), 3);
  assert.ok(!JSON.stringify(await a.ops.list({})).includes('MONGODB_URI'));
});
test('operations scanning detects financial, delivery and provider failures without recursive alert storms', async () => {
  const { a } = await fixture();
  await a
    .c('payments')
    .insertOne({ _id: 'needs-refund', requestKey: 'needs-refund', status: 'refund_required' });
  await a.c('outbox').insertOne({
    _id: 'delivery-failure',
    status: 'failed',
    attempts: 5,
    recipient: 'PRIVATE_CUSTOMER@example.test',
  });
  await a.ops.service('identity', false);
  await a.ops.scan();
  assert.equal((await a.c('operational_alerts').findOne({ _id: 'payment_attention' })).count, 1);
  assert.equal(
    (await a.c('operational_alerts').findOne({ _id: 'notification_failures' })).count,
    1,
  );
  const count = await a.c('outbox').countDocuments({ event: 'operational_alert' });
  await a.c('outbox').updateMany({ event: 'operational_alert' }, { $set: { status: 'failed' } });
  await a.ops.scan();
  assert.equal(await a.c('outbox').countDocuments({ event: 'operational_alert' }), count);
  assert.equal(
    (await a.c('operational_alerts').findOne({ _id: 'notification_failures' })).count,
    1,
  );
  assert.equal((await a.c('operational_alerts').findOne({ _id: 'alert_delivery' })).status, 'open');
  const alert = await a.c('outbox').findOne({ event: 'operational_alert' });
  assert.ok(!JSON.stringify(alert.notice).includes('PRIVATE_CUSTOMER'));
  await a.ops.service('identity', true);
  await a.c('payments').updateOne({ _id: 'needs-refund' }, { $set: { status: 'refunded' } });
  await a.ops.scan();
  assert.equal(
    (await a.c('operational_alerts').findOne({ _id: 'payment_attention' })).status,
    'resolved',
  );
});
test('stale instances can be retired, and durable webhook delivery keeps one event id across retries', async () => {
  const { a } = await fixture(),
    events = [];
  a.ops = new Operations(a, {
    instance: 'current-app',
    webhook: {
      enabled: true,
      async send(event, id) {
        events.push({ event, id });
        return true;
      },
    },
  });
  await a
    .c('ops_instances')
    .insertOne({ _id: 'stopped-app', lastSeen: new Date(Date.now() - 600000) });
  await a.ops.scan();
  const stopped = await a.c('ops_instances').findOne({ _id: 'stopped-app' });
  await a.ops.retire('stopped-app', 'admin', { lastSeen: stopped.lastSeen.toISOString() });
  await a.ops.scan();
  const key = 'instance:' + digest('stopped-app').slice(0, 24);
  assert.equal((await a.c('operational_alerts').findOne({ _id: key })).status, 'resolved');
  await a.ops.deliver();
  assert.ok(events.length >= 2);
  assert.ok(events.every((row) => row.event.eventId === row.id));
  assert.ok(!JSON.stringify(events).includes('PRIVATE_'));
});
test('MFA counters, expiry, password rotation and recovery-code replacement remain enforced across replicas', async () => {
  const { a, b } = await fixture();
  let time = Date.now();
  a.mfa = new AdminMfa(a, { key: '0123456789abcdef'.repeat(4), now: () => time });
  b.mfa = new AdminMfa(b, { key: '0123456789abcdef'.repeat(4), now: () => time });
  await a.setAdmin('counter-admin', 'counter-admin-password');
  const begin = await a.loginAdmin('counter-admin', 'counter-admin-password'),
    setup = await a.mfa.setup(begin.challengeToken),
    login = await a.mfa.verify(begin.challengeToken, {
      code: totp(setup.secret, Math.floor(time / 30000)),
    });
  time += 30000;
  const next = await a.loginAdmin('counter-admin', 'counter-admin-password'),
    other = await b.loginAdmin('counter-admin', 'counter-admin-password'),
    code = totp(setup.secret, Math.floor(time / 30000));
  const logged = await Promise.allSettled([
    a.mfa.verify(next.challengeToken, { code }),
    b.mfa.verify(other.challengeToken, { code }),
  ]);
  assert.equal(logged.filter((item) => item.status === 'fulfilled').length, 1);
  const rotated = await b.mfa.rotate('counter-admin', {
    password: 'counter-admin-password',
    code: login.recoveryCodes[0],
  });
  assert.equal(rotated.recoveryCodes.length, 8);
  const expired = await a.loginAdmin('counter-admin', 'counter-admin-password');
  time += 300001;
  await assert.rejects(b.mfa.verify(expired.challengeToken, { code: rotated.recoveryCodes[0] }), {
    status: 401,
  });
  const fresh = await a.loginAdmin('counter-admin', 'counter-admin-password');
  await a.setAdmin('counter-admin', 'changed-admin-password');
  await assert.rejects(b.mfa.verify(fresh.challengeToken, { code: rotated.recoveryCodes[0] }), {
    status: 401,
  });
  await assert.rejects(b.authenticateAdmin(login.token), { status: 401 });
  const changed = await a.loginAdmin('counter-admin', 'changed-admin-password');
  assert.equal(changed.enrollmentRequired, false);
  await assert.rejects(a.mfa.verify(changed.challengeToken, { code: login.recoveryCodes[1] }), {
    status: 401,
  });
});
test('provider telemetry and payment failure webhooks report sanitized health without changing paid bookings', async () => {
  const { a } = await fixture(),
    user = (await a.registerUser(account())).user;
  const { gateway } = gatewayFixture(),
    store = new MongoPaymentStore(a),
    payments = createPaymentService(store, gateway),
    order = await payments.order(booking(user), user);
  const failedGateway = {
      ...gateway,
      getPayment: async (id) => ({
        id,
        orderId: order.orderId,
        amount: order.amount,
        currency: 'INR',
        status: 'failed',
      }),
    },
    failedService = createPaymentService(store, failedGateway),
    raw = JSON.stringify({
      event: 'payment.failed',
      payload: { payment: { entity: { id: 'pay_FAILED', order_id: order.orderId } } },
    });
  await Promise.all([
    failedService.webhook(raw, sign(raw, 'test-webhook')),
    failedService.webhook(raw, sign(raw, 'test-webhook')),
  ]);
  assert.equal(await a.c('payment_failures').countDocuments({}), 1);
  assert.equal((await a.c('payments').findOne({ _id: order.attemptId })).status, 'created');
  assert.equal(await a.c('bookings').countDocuments({}), 0);
});
test('one misconfigured replica cannot have its MFA alert cleared by a healthy peer', async () => {
  const { a, b } = await fixture();
  await a.setAdmin('multi-admin', 'multi-admin-password');
  await fullAdminLogin(a, 'multi-admin', 'multi-admin-password');
  a.ops = new Operations(a, { instance: 'healthy-app' });
  b.ops = new Operations(b, { instance: 'bad-key-app' });
  b.mfa = new AdminMfa(b, { key: 'f'.repeat(64) });
  await b.ops.scan();
  await a.ops.scan();
  const key = 'mfa:' + digest('bad-key-app').slice(0, 24);
  assert.equal((await a.c('operational_alerts').findOne({ _id: key })).status, 'open');
  assert.equal((await a.c('operational_alerts').findOne({ _id: key })).source, 'bad-key-app');
});
test('alert-delivery retries remain scoped to failed operational jobs and never resend uncertain SMS', async () => {
  const { a } = await fixture();
  await a.c('outbox').insertMany([
    { _id: 'ops-failed', event: 'operational_alert', status: 'failed', attempts: 5 },
    { _id: 'booking-failed', status: 'failed', attempts: 5 },
  ]);
  await a.c('sms_outbox').insertMany([
    { _id: 'ops-sms-failed', event: 'operational_alert', status: 'failed', attempts: 3 },
    { _id: 'ops-sms-unknown', event: 'operational_alert', status: 'unknown', attempts: 1 },
    {
      _id: 'ops-sms-accepted',
      event: 'operational_alert',
      status: 'accepted',
      batchId: 'a'.repeat(24),
    },
  ]);
  await a.c('ops_webhooks').insertOne({ _id: 'ops-webhook-failed', status: 'failed', attempts: 5 });
  const result = await a.ops.retryDelivery('admin');
  assert.equal(result.email, 1);
  assert.equal(result.sms, 1);
  assert.equal(result.webhook, 1);
  assert.equal((await a.c('outbox').findOne({ _id: 'booking-failed' })).status, 'failed');
  assert.equal((await a.c('sms_outbox').findOne({ _id: 'ops-sms-unknown' })).status, 'unknown');
  assert.equal((await a.c('sms_outbox').findOne({ _id: 'ops-sms-accepted' })).status, 'accepted');
});

test('small synthetic launch pilot completes five paid journeys across replicas and restores booking history and seat inventory', async () => {
  const { captureSnapshot, encryptSnapshot, decryptSnapshot, restoreAndVerify } = await import(
    '../server/recovery/snapshot.js'
  );
  const { a, b } = await fixture(),
    users = await Promise.all(
      Array.from({ length: 5 }, () => a.registerUser(account()).then((result) => result.user)),
    ),
    { gateway } = gatewayFixture();
  const services = [a, b].map((repo) => createPaymentService(new MongoPaymentStore(repo), gateway));
  const inputs = users.map((user, index) =>
    booking(user, { seats: [String(index + 1).padStart(2, '0')] }),
  );
  const orders = await Promise.all(
    inputs.map((input, index) => services[index % 2].order(input, users[index])),
  );
  for (let index = 0; index < 5; index++)
    await assert.rejects(
      services[(index + 1) % 2].order(
        { ...inputs[index], requestKey: randomUUID() },
        users[(index + 1) % 5],
      ),
      { status: 409 },
    );
  const confirmed = await Promise.all(
    orders.map(async (order, index) => {
      const paymentId = 'pay_' + order.orderId.split('_')[1],
        verification = {
          attemptId: order.attemptId,
          orderId: order.orderId,
          paymentId,
          signature: sign(order.orderId + '|' + paymentId),
        };
      const raw = JSON.stringify({
        event: 'payment.captured',
        payload: { payment: { entity: { id: paymentId, order_id: order.orderId } } },
      });
      const result = await Promise.all([
        services[0].verify(verification, users[index]),
        services[1].verify(verification, users[index]),
        services[1].webhook(raw, sign(raw, 'test-webhook')),
      ]);
      assert.equal(result[0].id, result[1].id);
      return result[0];
    }),
  );
  assert.equal(new Set(confirmed.map((row) => row.id)).size, 5);
  assert.equal(await a.c('bookings').countDocuments({}), 5);
  assert.equal(await a.c('payments').countDocuments({ status: 'paid' }), 5);
  for (const user of users) {
    assert.equal((await b.userBookings(user.id)).total, 1);
    assert.equal((await b.userPayments(user.id, {})).total, 1);
  }
  await assert.rejects(b.userBooking(users[0].id, confirmed[1].id), { status: 404 });
  const delivered = [],
    config = {
      enabled: true,
      configured: true,
      user: 'sender@gmail.com',
      adminTo: 'admin@example.test',
      siteOrigin: 'https://example.test',
    },
    transport = {
      sendMail: async (message) => {
        delivered.push(message.messageId);
        return { accepted: [message.to.address] };
      },
    };
  const workers = [a, b].map((repo) =>
    createSharedEmailService(new MongoOutboxStore(repo), { config, transport }),
  );
  try {
    await Promise.all(workers.map((worker) => worker.drain()));
    assert.equal(delivered.length, 10);
    assert.equal(new Set(delivered).size, 10);
  } finally {
    await Promise.all(workers.map((worker) => worker.stop()));
  }
  const snapshot = await captureSnapshot(a),
    archive = encryptSnapshot(snapshot, 'ac'.repeat(32)),
    restoredDb = a.client.db('nautica_restore_' + randomUUID().replaceAll('-', ''));
  try {
    await restoreAndVerify(restoredDb, decryptSnapshot(archive, 'ac'.repeat(32)));
    const restored = new MongoRepository({
      client: a.client,
      db: restoredDb,
      config: { ...a.config, database: restoredDb.databaseName },
    });
    await restored.health();
    for (const user of users) {
      assert.equal((await restored.userBookings(user.id)).total, 1);
      assert.equal((await restored.userPayments(user.id, {})).total, 1);
    }
    assert.deepEqual((await restored.availability(inputs[0])).bookedSeats.sort(), [
      '01',
      '02',
      '03',
      '04',
      '05',
    ]);
  } finally {
    await restoredDb.dropDatabase();
  }
});

test('checkout UX exposes held versus confirmed seats and ownership-scoped recovery without provider calls', async () => {
  const { a, b } = await fixture(),
    user = (await a.registerUser(account())).user,
    stranger = (await b.registerUser(account())).user,
    { gateway, count } = gatewayFixture();
  const payments = createPaymentService(new MongoPaymentStore(a), gateway),
    input = booking(user),
    order = await payments.order(input, user);
  assert.ok(order.serverNow <= order.expires);
  const available = await b.availability(input);
  assert.deepEqual(available.heldSeats, ['01']);
  assert.deepEqual(available.confirmedSeats, []);
  assert.deepEqual(available.bookedSeats, ['01']);
  const server = createApp(null, { repository: b });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  const ownerSession = await a.loginUser({ email: user.email, password: 'strong-test-passphrase' }),
    otherSession = await b.loginUser({ email: stranger.email, password: 'strong-test-passphrase' });
  const lookup = async (token) => {
    const response = await fetch(base + '/api/payments/status?requestKey=' + input.requestKey, {
      headers: token ? { Cookie: 'nautica_user=' + token } : {},
    });
    return { response, body: await response.json() };
  };
  try {
    assert.equal((await lookup()).response.status, 401);
    assert.equal((await lookup(otherSession.token)).body.status, 'not_found');
    const pending = await lookup(ownerSession.token);
    assert.equal(pending.body.status, 'created');
    assert.equal(pending.response.headers.get('cache-control'), 'no-store');
    assert.equal(pending.body.expires, order.expires);
    assert.equal(pending.body.orderId, undefined);
    assert.equal(pending.body.userId, undefined);
    await payments.verify(
      {
        attemptId: order.attemptId,
        orderId: order.orderId,
        paymentId: 'pay_1',
        signature: sign(order.orderId + '|pay_1'),
      },
      user,
    );
    const recovered = await lookup(ownerSession.token);
    assert.equal(recovered.body.status, 'confirmed');
    assert.ok(recovered.body.booking.id);
    assert.equal(recovered.body.booking.userId, undefined);
    assert.equal(count(), 1);
    const after = await b.availability(input);
    assert.deepEqual(after.heldSeats, []);
    assert.deepEqual(after.confirmedSeats, ['01']);
    assert.equal(await a.c('payments').countDocuments({}), 1);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});

test('reviewed listing photos stay private until approval and journey shortcuts are owner scoped', async () => {
  const sharp = (await import('sharp')).default,
    { a, b } = await fixture(),
    user = (await a.registerUser(account())).user,
    other = (await a.registerUser(account())).user,
    actor = { role: 'owner', id: user.id };
  let boat = await documented(
    a,
    actor,
    fleetDetails({
      accessibilityNotes: 'Step access; ask the operator about assistance.',
      safetyNotes: 'Wear a fitted life jacket and follow the captain.',
      descriptionHi: 'गंगा यात्रा के लिए पंजीकृत नाव।',
      boardingInstructionsHi: 'निर्धारित घाट पर कप्तान से मिलें।',
    }),
  );
  const image = await sharp({
      create: { width: 12, height: 12, channels: 3, background: '#336677' },
    })
      .png()
      .toBuffer(),
    photo = {
      revision: boat.revision,
      data: image.toString('base64'),
      mime: 'image/png',
      consent: true,
      alt: 'The real boat moored at its boarding pier',
    };
  await assert.rejects(a.fleet.uploadPhoto(boat.id, { role: 'owner', id: other.id }, photo), {
    status: 404,
  });
  a.fleet.scan = async () => 'clean';
  boat = await a.fleet.uploadPhoto(boat.id, actor, photo);
  assert.equal(boat.status, 'draft');
  assert.equal(boat.hasPhoto, true);
  assert.equal(boat.coverPhoto, undefined);
  assert.ok((await a.fleet.privatePhoto(boat.id, actor)).length > 0);
  await assert.rejects(a.fleet.privatePhoto(boat.id, { role: 'owner', id: other.id }), {
    status: 404,
  });
  await assert.rejects(b.fleet.publicPhoto(boat.id), { status: 404 });
  boat = await a.fleet.submit(boat.id, actor, { revision: boat.revision, declaration: true });
  boat = await a.fleet.review(
    boat.id,
    { role: 'admin', id: 'photo-reviewer' },
    { ...fleetReview, revision: boat.revision },
  );
  const listing = (await b.fleet.catalog()).boats.find((row) => row.id === boat.id);
  assert.ok(listing.photoUrl);
  assert.equal(listing.descriptionHi, 'गंगा यात्रा के लिए पंजीकृत नाव।');
  assert.match(listing.accessibilityNotes, /Step access/);
  assert.equal(listing.operatorName, undefined);
  assert.equal(listing.documents, undefined);
  assert.ok((await b.fleet.publicPhoto(boat.id)).length > 0);
  const pass = await a.createBooking(
    booking(user, { boatId: boat.id, date: localDate(new Date(Date.now() + 3 * 86400000)) }),
    'seats',
    user,
  );
  const journey = await b.nextJourney(user.id);
  assert.equal(journey.id, pass.id);
  assert.equal(journey.boat.boardingInstructions, fleetDetails().boardingInstructions);
  assert.ok(journey.departureAt);
  assert.equal(await b.nextJourney(other.id), null);
  assert.equal(journey.cancellation.estimatedRefund, 126000);
  const server = createApp(null, { repository: b });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  const ownerToken = (await a.loginUser({ email: user.email, password: 'strong-test-passphrase' }))
      .token,
    otherToken = (await a.loginUser({ email: other.email, password: 'strong-test-passphrase' }))
      .token;
  try {
    const publicImage = await fetch(base + listing.photoUrl);
    assert.equal(publicImage.status, 200);
    assert.equal(publicImage.headers.get('content-type'), 'image/jpeg');
    assert.equal(publicImage.headers.get('cache-control'), 'no-store');
    assert.equal((await fetch(base + '/api/owner/boats/' + boat.id + '/photos')).status, 401);
    assert.equal(
      (
        await fetch(base + '/api/owner/boats/' + boat.id + '/photos', {
          headers: { Cookie: 'nautica_user=' + otherToken },
        })
      ).status,
      404,
    );
    const own = await fetch(base + '/api/user/next-journey', {
      headers: { Cookie: 'nautica_user=' + ownerToken },
    });
    assert.equal((await own.json()).journey.id, pass.id);
    const stranger = await fetch(base + '/api/user/next-journey', {
      headers: { Cookie: 'nautica_user=' + otherToken },
    });
    assert.equal((await stranger.json()).journey, null);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }

  await assert.rejects(a.fleet.uploadPhoto(boat.id, actor, { ...photo, revision: boat.revision }), {
    status: 409,
  });
  await a.fleet.review(
    boat.id,
    { role: 'admin', id: 'photo-reviewer' },
    { action: 'suspend', notes: 'Suspend pending operational review.', revision: boat.revision },
  );
  await assert.rejects(b.fleet.publicPhoto(boat.id), { status: 404 });
});

test('email proof is single use across replicas, bound to the signed-in account, and gates new bookings', async () => {
  const { a, b } = await fixture(),
    registered = await a.unverifiedRegistration(account()),
    user = registered.user,
    other = (await b.registerUser(account())).user;
  assert.equal(user.emailVerified, false);
  await assert.rejects(a.createBooking(booking(user), 'seats', user), { status: 403 });
  const { gateway, count } = gatewayFixture();
  await assert.rejects(
    createPaymentService(new MongoPaymentStore(a), gateway).order(booking(user), user),
    { status: 403 },
  );
  assert.equal(count(), 0);
  const job = await a.emailProof.request(user.id, {
      enabled: true,
      siteOrigin: 'https://example.test',
    }),
    token = new URLSearchParams(new URL(job.link).hash.slice(1)).get('token');
  const stored = await a.c('email_verifications').findOne({ userId: user.id });
  assert.equal(stored.tokenHash, digest(token));
  assert.ok(!JSON.stringify(stored).includes(token));
  await assert.rejects(b.emailProof.verify(other.id, token), { status: 400 });
  const results = await Promise.allSettled([
    a.emailProof.verify(user.id, token),
    b.emailProof.verify(user.id, token),
  ]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal((await a.authenticateUser(registered.token)).emailVerified, true);
  assert.ok((await b.createBooking(booking(user), 'seats', user)).id);
});
test('resending, expiry, changed email and password reset invalidate email proof without verifying by assumption', async () => {
  const { a } = await fixture(),
    user = (await a.unverifiedRegistration(account())).user,
    settings = { enabled: true, siteOrigin: 'https://example.test' },
    token = (job) => new URLSearchParams(new URL(job.link).hash.slice(1)).get('token');
  const first = token(await a.emailProof.request(user.id, settings)),
    second = token(await a.emailProof.request(user.id, settings));
  await assert.rejects(a.emailProof.verify(user.id, first), { status: 400 });
  assert.equal(await a.c('email_verifications').countDocuments({ userId: user.id }), 1);
  await a
    .c('email_verifications')
    .updateOne({ userId: user.id }, { $set: { expiresAt: new Date(0) } });
  await assert.rejects(a.emailProof.verify(user.id, second), { status: 400 });
  const third = token(await a.emailProof.request(user.id, settings));
  await a.c('users').updateOne({ _id: user.id }, { $set: { email: 'changed@example.test' } });
  await assert.rejects(a.emailProof.verify(user.id, third), { status: 400 });
  const fourth = token(await a.emailProof.request(user.id, settings));
  await a.changeUserPassword(user.id, {
    currentPassword: 'strong-test-passphrase',
    newPassword: 'a different safe test phrase',
  });
  await assert.rejects(a.emailProof.verify(user.id, fourth), { status: 400 });
  assert.equal(
    (await a.loginUser({ email: 'changed@example.test', password: 'a different safe test phrase' }))
      .user.emailVerified,
    false,
  );
});
test('booking emails wait for the owning account email proof and resume once without spending delivery retries', async () => {
  const { a } = await fixture(),
    user = (await a.registerUser(account())).user,
    pass = await a.createBooking(booking(user), 'seats', user);
  await a
    .c('users')
    .updateOne({ _id: user.id }, { $unset: { verifiedEmail: '', emailVerifiedAt: '' } });
  const sent = [],
    service = createSharedEmailService(new MongoOutboxStore(a), {
      config: {
        enabled: true,
        configured: true,
        user: 'sender@gmail.com',
        adminTo: 'admin@example.test',
        siteOrigin: 'https://example.test',
      },
      transport: {
        sendMail: async (message) => {
          sent.push(message);
          return { accepted: [message.to.address] };
        },
      },
    });
  try {
    await service.drain();
    assert.equal(sent.length, 1);
    const held = await a.c('outbox').findOne({ bookingId: pass.id, audience: 'customer' });
    assert.equal(held.status, 'verification_required');
    assert.equal(held.attempts, 0);
    const job = await a.emailProof.request(user.id, {
        enabled: true,
        siteOrigin: 'https://example.test',
      }),
      token = new URLSearchParams(new URL(job.link).hash.slice(1)).get('token');
    await a.emailProof.verify(user.id, token);
    await service.drain();
    assert.equal(sent.length, 2);
    assert.equal(await a.c('outbox').countDocuments({ bookingId: pass.id, status: 'sent' }), 2);
  } finally {
    await service.stop();
  }
});

test('email verification HTTP requires the account session, same-origin confirmation and never returns a token', async () => {
  const { a } = await fixture();
  a.registerUser = a.unverifiedRegistration;
  const jobs = [],
    email = {
      status: () => ({
        passwordResetEnabled: true,
        siteOrigin: 'https://example.test',
        configured: true,
      }),
      sendVerification: async (job) => jobs.push(job),
      kick: () => {},
    };
  const server = createApp(null, { repository: a, emailService: email });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  const call = (path, body, cookie, origin = true) =>
    fetch(base + path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Nautica-Request': '1',
        ...(origin ? { Origin: base } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: JSON.stringify(body),
    });
  try {
    const response = await call('/api/user/register', account()),
      cookie = response.headers.get('set-cookie').split(';')[0],
      registered = await response.json();
    assert.equal(response.status, 201);
    assert.equal(registered.user.emailVerified, false);
    assert.equal(registered.token, undefined);
    assert.equal(jobs.length, 1);
    const token = new URLSearchParams(new URL(jobs[0].link).hash.slice(1)).get('token');
    assert.equal((await call('/api/user/email/verify', { token })).status, 401);
    assert.equal((await call('/api/user/email/verify', { token }, cookie, false)).status, 403);
    const verified = await call('/api/user/email/verify', { token }, cookie);
    assert.equal(verified.status, 200);
    assert.deepEqual(await verified.json(), { ok: true });
    assert.equal((await call('/api/user/email/verify', { token }, cookie)).status, 400);
    const session = await fetch(base + '/api/user/session', { headers: { Cookie: cookie } });
    assert.equal((await session.json()).user.emailVerified, true);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});
test('production-style password policy rejects unsafe new credentials without disabling existing-password login', async () => {
  const { PasswordPolicy } = await import('../server/security/passwords.js'),
    { a } = await fixture(),
    registered = await a.registerUser(account()),
    user = registered.user;
  a.passwordPolicy = new PasswordPolicy({
    required: true,
    fetcher: async () => {
      throw new Error('PRIVATE_UPSTREAM_ERROR');
    },
  });
  await assert.rejects(a.unverifiedRegistration(account()), { status: 503 });
  assert.equal(
    (await a.loginUser({ email: user.email, password: 'strong-test-passphrase' })).user.id,
    user.id,
  );
  await assert.rejects(
    a.changeUserPassword(user.id, {
      currentPassword: 'strong-test-passphrase',
      newPassword: 'Password1234!',
    }),
    { status: 400 },
  );
  await assert.rejects(a.setAdmin('unsafe-admin', 'Password1234!'), { status: 400 });
  const reset = await a.requestPasswordReset(
    { email: user.email },
    { enabled: true, siteOrigin: 'https://example.test' },
  );
  await assert.rejects(
    a.resetUserPassword({ token: reset.token, newPassword: 'another safe password phrase' }),
    { status: 503 },
  );
  assert.equal((await a.authenticateUser(registered.token)).id, user.id);
});
