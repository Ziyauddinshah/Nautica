/** @file Legacy SQLite restoration to a new private path without overwriting existing data. */
import { DatabaseSync, backup } from 'node:sqlite';
import { existsSync, mkdirSync, chmodSync, linkSync, unlinkSync } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { databasePath, projectRoot } from '../server/database-path.js';

process.umask(0o077);
const source = process.argv[2] && resolve(process.argv[2]),
  target = databasePath();
if (!source || !existsSync(source)) throw new Error('Provide an existing SQLite backup file.');
if (target === ':memory:') throw new Error('Restoration requires a persistent database file.');
const publicDirectory = resolve(projectRoot, 'dist');
if (target === publicDirectory || target.startsWith(publicDirectory + sep))
  throw new Error('Database must be outside dist.');
if (['', '-wal', '-shm'].some((suffix) => existsSync(target + suffix)))
  throw new Error(
    'Destination database or sidecars already exist. Restore to a NEW path; existing data is never overwritten or merged.',
  );
const db = new DatabaseSync(source, { readOnly: true }),
  temporary = target + '.' + randomUUID() + '.restore';
try {
  const result = db.prepare('PRAGMA integrity_check').all();
  if (result.length !== 1 || result[0].integrity_check !== 'ok')
    throw new Error('Backup integrity check failed.');
  for (const table of ['users', 'bookings', 'seats'])
    if (!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table))
      throw new Error('Backup is not a recognized Nautica database.');
  mkdirSync(dirname(target), { recursive: true, mode: 0o700 });
  await backup(db, temporary);
  chmodSync(temporary, 0o600);
  // Publish atomically without replacing a database created by another process.
  linkSync(temporary, target);
  console.log('Database restored to:', target);
  console.log('Run npm run db:status, then start ONE backend and point all devices to its URL.');
} finally {
  db.close();
  if (existsSync(temporary)) unlinkSync(temporary);
}
