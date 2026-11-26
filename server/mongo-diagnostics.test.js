/** @file Regression tests for mongo-diagnostics behavior using isolated fixtures. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mongoDiagnostics } from './mongo-diagnostics.js';
test('nested topology errors identify DNS, authentication, permission, TLS and network failures', () => {
  for (const [cause, category] of [
    [{ code: 'ENOTFOUND' }, 'DNS'],
    [{ code: 18 }, 'AUTHENTICATION'],
    [{ code: 13 }, 'AUTHORIZATION'],
    [{ code: 'SELF_SIGNED_CERT_IN_CHAIN' }, 'TLS'],
    [{ code: 'ECONNREFUSED' }, 'NETWORK_OR_CLUSTER'],
  ])
    assert.equal(
      mongoDiagnostics({
        name: 'MongoServerSelectionError',
        reason: { servers: new Map([['private-host', { error: { cause } }]]) },
      }).category,
      category,
    );
  assert.equal(mongoDiagnostics({ name: 'MongoParseError' }).category, 'URI');
});
test('diagnostics never echo raw messages, hosts, URIs or credentials, including cyclic causes', () => {
  const error = { message: 'mongodb+srv://PRIVATE_USER:PRIVATE_PASSWORD@PRIVATE_HOST/' };
  error.cause = error;
  const result = JSON.stringify(mongoDiagnostics(error));
  assert.ok(!result.includes('PRIVATE_'));
  assert.ok(!result.includes('mongodb+srv'));
  assert.equal(
    mongoDiagnostics({ code: 8000, message: 'bad auth: authentication failed PRIVATE_PASSWORD' })
      .category,
    'AUTHENTICATION',
  );
  assert.ok(
    !JSON.stringify(
      mongoDiagnostics({ code: 8000, message: 'bad auth PRIVATE_PASSWORD' }),
    ).includes('PRIVATE_PASSWORD'),
  );
});
