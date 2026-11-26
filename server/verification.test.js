/** @file Regression tests for verification behavior using isolated fixtures. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { identityProvider } from './verification/provider.js';
const settings = {
  IDENTITY_BRIDGE_URL: 'https://bridge.example.test',
  IDENTITY_BRIDGE_KEY: 'a-private-key-at-least-32-characters-long',
  IDENTITY_CHECKOUT_ORIGIN: 'https://verify.example.test',
};
test('identity adapter fails closed without configuration and accepts only the configured hosted origin', async () => {
  const disabled = identityProvider({});
  assert.equal(disabled.enabled, false);
  await assert.rejects(disabled.start({}), {
    status: 503,
  });
  for (const url of [
    'http://verify.example.test/session/123',
    'https://attacker.test/session/123',
    'https://verify.example.test.attacker.test/session/123',
    'https://evil@verify.example.test/session/123',
  ]) {
    const provider = identityProvider(settings, async () =>
      Response.json({
        id: 'session_1234',
        url,
      }),
    );
    await assert.rejects(
      provider.start({
        userId: 'owner',
        requestId: 'request',
        method: 'aadhaar',
      }),
      {
        status: 503,
      },
    );
  }
});
test('identity bridge contract binds the subject and request, with no Aadhaar number in the application request', async () => {
  const calls = [],
    provider = identityProvider(settings, async (url, options) => {
      calls.push({
        url,
        options,
      });
      return Response.json({
        id: 'session_1234',
        url: 'https://verify.example.test/session/123',
      });
    });
  const result = await provider.start({
    userId: 'owner',
    requestId: 'request',
    method: 'alternative',
  });
  assert.equal(result.id, 'session_1234');
  const { url, options } = calls[0];
  assert.equal(url, 'https://bridge.example.test/sessions');
  assert.equal(options.headers.Authorization, 'Bearer ' + settings.IDENTITY_BRIDGE_KEY);
  assert.equal(options.redirect, 'error');
  assert.deepEqual(JSON.parse(options.body), {
    subject: 'owner',
    requestId: 'request',
    method: 'alternative',
    purpose: 'boat_owner_registration',
    consentVersion: 'owner-identity-v1',
  });
});
test('identity provider errors and malformed responses never disclose bridge secrets', async () => {
  for (const response of [
    () => {
      throw new Error(settings.IDENTITY_BRIDGE_KEY);
    },
    () =>
      Response.json(
        {
          secret: settings.IDENTITY_BRIDGE_KEY,
        },
        {
          status: 500,
        },
      ),
    () => Response.json(null),
  ]) {
    const provider = identityProvider(settings, async () => response());
    await assert.rejects(
      provider.result('session_1234'),
      (error) => error.status === 503 && !error.message.includes(settings.IDENTITY_BRIDGE_KEY),
    );
  }
});
