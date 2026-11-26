/** @file Regression tests for recovery behavior using isolated fixtures. */
import { mkdtemp, rm, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const run = promisify(execFile);
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import { MongoClient, Long, Binary, Double } from 'mongodb';
import {
  captureSnapshot,
  encryptSnapshot,
  decryptSnapshot,
  restoreAndVerify,
} from '../server/recovery/snapshot.js';
import { secretBox } from '../server/security/totp.js';
test('encrypted snapshot restores records, binary documents, MFA secrets and unique indexes in isolation', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'nautica-backup-test-'));
  const cluster = await MongoMemoryReplSet.create({
      binary: { version: '8.0.16' },
      instanceOpts: [{ args: ['--setParameter', 'ttlMonitorEnabled=false'] }],
      replSet: { count: 1 },
    }),
    client = new MongoClient(cluster.getUri());
  try {
    await client.connect();
    const source = client.db('nautica_fixture'),
      db = client.db('nautica_restore_abc123'),
      key = 'ab'.repeat(32),
      mfaKey = 'cd'.repeat(32);
    await source.collection('metadata').insertOne({ _id: 'schema', version: 1, state: 'ready' });
    await source.collection('users').createIndex({ email: 1 }, { unique: true });
    await source.collection('users').insertOne({
      _id: 'guest',
      email: 'synthetic@example.test',
      amount: Long.fromString('9007199254740993'),
      double: new Double(1),
    });
    await source
      .collection('boat_documents')
      .insertOne({ _id: 'doc', bytes: new Binary(Buffer.from('synthetic private document')) });
    await source.collection('admins').insertOne({
      _id: 'pilot-admin',
      id: 'pilot-admin',
      mfa: { secret: secretBox(mfaKey).seal('TESTSEED', 'pilot-admin') },
    });
    const snapshot = await captureSnapshot({ client, db: source }),
      archive = encryptSnapshot(snapshot, key);
    assert.equal(archive.includes(Buffer.from('synthetic@example.test')), false);
    assert.throws(() => decryptSnapshot(archive, 'ee'.repeat(32)));
    const corrupt = Buffer.from(archive);
    corrupt[corrupt.length - 1] ^= 1;
    assert.throws(() => decryptSnapshot(corrupt, key));
    const result = await restoreAndVerify(db, decryptSnapshot(archive, key));
    assert.equal(result.records, 4);
    assert.equal(
      secretBox(mfaKey).open((await db.collection('admins').findOne()).mfa.secret, 'pilot-admin'),
      'TESTSEED',
    );
    await assert.rejects(db.collection('users').insertOne({ email: 'synthetic@example.test' }), {
      code: 11000,
    });
    await assert.rejects(restoreAndVerify(source, snapshot));
    await assert.rejects(restoreAndVerify(db, snapshot));
    assert.equal(await source.collection('users').countDocuments(), 1);
    const filename = join(directory, 'backup.nbk'),
      env = {
        ...process.env,
        NODE_ENV: 'test',
        MONGODB_URI: cluster.getUri(),
        MONGODB_DB: source.databaseName,
        BACKUP_ENCRYPTION_KEY: key,
        ADMIN_MFA_ENCRYPTION_KEY: mfaKey,
      };
    await run(process.execPath, ['scripts/mongo-backup.js', filename], { env });
    const original = await readFile(filename);
    if (process.platform !== 'win32') assert.equal((await stat(filename)).mode & 0o777, 0o600);
    await assert.rejects(run(process.execPath, ['scripts/mongo-backup.js', filename], { env }));
    assert.deepEqual(await readFile(filename), original);
    const restored = await run(process.execPath, ['scripts/mongo-restore-test.js', filename], {
      env,
    });
    const report = JSON.parse(restored.stdout.trim());
    assert.equal(report.mfaSecretsVerified, 1);
    assert.equal(report.liveProvidersUsed, false);
    assert.equal(report.records, 4);
    await assert.rejects(
      run(process.execPath, ['scripts/mongo-restore-test.js', filename], {
        env: { ...env, ADMIN_MFA_ENCRYPTION_KEY: 'aa'.repeat(32) },
      }),
    );
    assert.equal(await source.collection('users').countDocuments(), 1);
  } finally {
    await client.close();
    await cluster.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
