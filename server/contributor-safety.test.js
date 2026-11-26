/** @file Regression tests for contributor-safety behavior using isolated fixtures. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { boundaryIssues } from '../scripts/check-boundaries.js';
test('contributor guard rejects private artifacts and server imports without exposing their contents', () => {
  for (const name of [
    '.env',
    'config/.env.production',
    'data/customers.json',
    'exports/private.nbk',
    'certs/tls.key',
  ])
    assert.ok(boundaryIssues(name).length);
  assert.equal(boundaryIssues('.env.example').length, 0);
  assert.ok(boundaryIssues('src/leak.js', "import {MongoClient} from 'mongodb';").length);
  assert.ok(boundaryIssues('src/lib/leak.js', "export {x} from '../../server/config.js';").length);
  assert.ok(
    boundaryIssues('src/leak.js', 'const value = import.meta.env.VITE_PRIVATE_KEY;').length,
  );
  assert.equal(
    boundaryIssues('src/components/Safe.jsx', "import {x} from '../domain/booking.js';").length,
    0,
  );
});
