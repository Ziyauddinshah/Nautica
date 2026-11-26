/** @file Regression tests for dev privacy behavior using isolated fixtures. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { resolveConfig, isFileLoadingAllowed, normalizePath } from 'vite';

test('Vite blocks server-only files while allowing the React frontend, without opening a preview server', async () => {
  const config = await resolveConfig({}, 'serve');
  for (const file of [
    '.env',
    '.env.production',
    'data/nautica.sqlite',
    'data/nautica.sqlite-wal',
    'data/nautica.sqlite-shm',
    'server/users.js',
    'scripts/admin-create.js',
    'private.key',
    '.git/config',
  ])
    assert.equal(isFileLoadingAllowed(config, normalizePath(resolve(file))), false, file);
  assert.equal(isFileLoadingAllowed(config, normalizePath(resolve('src/App.jsx'))), true);
});
test('a configured custom database file and sidecars are also blocked from development file serving', async () => {
  const previous = process.env.NAUTICA_DB;
  try {
    const database = normalizePath(resolve('private-bookings.db'));
    process.env.NAUTICA_DB = database;
    const config = await resolveConfig({}, 'serve');
    for (const suffix of ['', '-wal', '-shm'])
      assert.equal(isFileLoadingAllowed(config, database + suffix), false);
  } finally {
    if (previous === undefined) delete process.env.NAUTICA_DB;
    else process.env.NAUTICA_DB = previous;
  }
});
