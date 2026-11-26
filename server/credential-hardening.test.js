/** @file Password checks preserve existing hashes without blocking the event loop or exposing full hashes. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, scryptSync } from 'node:crypto';
import {
  PasswordPolicy,
  derivePassword,
  passwordMatchesAsync,
  customerHashOptions,
} from './security/passwords.js';
test('asynchronous derivation preserves customer/admin hashes and leaves timers responsive', async () => {
  const password = 'a long private passphrase',
    salt = 'test-salt';
  let ticked = false;
  const timer = setTimeout(() => {
    ticked = true;
  }, 0);
  const actual = await derivePassword(password, salt, customerHashOptions);
  clearTimeout(timer);
  assert.equal(ticked, true);
  assert.deepEqual(actual, scryptSync(password, salt, 64, customerHashOptions));
  assert.equal(await passwordMatchesAsync({ salt, hash: actual.toString('hex') }, password), true);
  assert.equal(
    await passwordMatchesAsync({ salt, hash: actual.toString('hex') }, 'wrong password'),
    false,
  );
  const admin = scryptSync(password, salt, 64).toString('hex');
  assert.equal(await passwordMatchesAsync({ salt, hash: admin }, password, {}), true);
});
test('password screening rejects common choices and compares only padded hash-range responses', async () => {
  const password = 'A genuinely unusual test phrase 729!',
    hash = createHash('sha1').update(password).digest('hex').toUpperCase();
  let calls = 0;
  const policy = new PasswordPolicy({
    required: true,
    fetcher: async (url, options) => {
      calls++;
      assert.equal(url, 'https://api.pwnedpasswords.com/range/' + hash.slice(0, 5));
      assert.equal(options.headers['Add-Padding'], 'true');
      assert.equal(url.includes(password), false);
      assert.equal(url.includes(hash), false);
      return new Response(hash.slice(5) + ':12\r\n' + 'A'.repeat(35) + ':0');
    },
  });
  await assert.rejects(policy.check('Password1234!'), { status: 400 });
  assert.equal(calls, 0);
  await assert.rejects(policy.check(password), { status: 400 });
  assert.equal(calls, 1);
  const safe = new PasswordPolicy({
    required: true,
    fetcher: async () => new Response('B'.repeat(35) + ':0'),
  });
  await safe.check(password);
});
test('required screening fails closed on outage or malformed replies without provider details', async () => {
  for (const fetcher of [
    async () => {
      throw new Error('PRIVATE_PROVIDER_DIAGNOSTIC');
    },
    async () => new Response('garbage'),
    async () => new Response('', { status: 503 }),
  ])
    await assert.rejects(
      new PasswordPolicy({ required: true, fetcher }).check('Another unusual secret phrase 839!'),
      (error) => error.status === 503 && !error.message.includes('PRIVATE_'),
    );
});
