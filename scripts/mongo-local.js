/** @file Starts a persistent loopback MongoDB replica set for local development. */
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { projectRoot } from '../server/database-path.js';
if (process.env.NODE_ENV === 'production')
  throw new Error(
    'Local MongoDB is for testing only. Production must use the shared online cluster.',
  );
const dbPath = resolve(projectRoot, 'data/mongo-local');
mkdirSync(dbPath, { recursive: true, mode: 0o700 });
const cluster = await MongoMemoryReplSet.create({
  binary: {
    version: '8.0.16',
    downloadDir: process.env.MONGOMS_DOWNLOAD_DIR || resolve(projectRoot, '.cache/mongodb'),
  },
  instanceOpts: [
    { port: 27017, dbPath, args: ['--wiredTigerCacheSizeGB', '0.25', '--oplogSize', '64'] },
  ],
  replSet: { count: 1, name: 'rs0', storageEngine: 'wiredTiger' },
});
console.log('Local test replica set ready at mongodb://127.0.0.1:27017/?replicaSet=rs0');
console.log(
  'Test data persists in data/mongo-local. Keep this process running. Never expose it to the internet.',
);
let stopping = false;
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, async () => {
    if (stopping) return;
    stopping = true;
    await cluster.stop({ doCleanup: false, force: false });
    process.exit(0);
  });
