/** @file Legacy SQLite booking and admin fixture; not the production database runtime. */
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, chmodSync, existsSync } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';
import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { databasePath, projectRoot } from './database-path.js';
import * as N from '../src/domain/booking.js';

import { ApiError, digest } from './errors.js';
export { ApiError, digest } from './errors.js';
import { tripInfo, validateBooking, buildBookingRecord } from './domain/booking.js';
export { tripInfo, validateBooking } from './domain/booking.js';
export function openStore(
  filename = databasePath(),
  { mustExist = process.env.NODE_ENV === 'production' } = {},
) {
  if (filename !== ':memory:') filename = resolve(projectRoot, filename);
  const publicDirectory = resolve(projectRoot, 'dist');
  if (
    filename !== ':memory:' &&
    (filename === publicDirectory || filename.startsWith(publicDirectory + sep))
  )
    throw new Error('Database must be outside dist.');
  if (mustExist && (filename === ':memory:' || !existsSync(filename)))
    throw new Error(
      'Persistent database is missing. Restore the database or explicitly initialize it with npm run db:init. Startup stopped to prevent an empty replacement.',
    );
  if (filename !== ':memory:') mkdirSync(dirname(filename), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(filename);
  if (mustExist) {
    try {
      for (const table of ['users', 'bookings'])
        if (!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table))
          throw new Error(
            'Database is not initialized. Restore your existing database or explicitly run npm run db:init.',
          );
    } catch (error) {
      db.close();
      throw error;
    }
  }
  if (filename !== ':memory:') chmodSync(filename, 0o600);
  db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,email TEXT NOT NULL UNIQUE COLLATE NOCASE,name TEXT NOT NULL,phone TEXT NOT NULL,salt TEXT NOT NULL,hash TEXT NOT NULL,created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS bookings(id TEXT PRIMARY KEY, request_key TEXT UNIQUE NOT NULL, request_hash TEXT NOT NULL, boat_id TEXT NOT NULL, date TEXT NOT NULL, slot TEXT NOT NULL, created_at TEXT NOT NULL, record TEXT NOT NULL,user_id TEXT REFERENCES users(id));
    CREATE TABLE IF NOT EXISTS seats(boat_id TEXT, date TEXT, slot TEXT, seat TEXT, booking_id TEXT REFERENCES bookings(id), PRIMARY KEY(boat_id,date,slot,seat));
    CREATE TABLE IF NOT EXISTS admins(username TEXT PRIMARY KEY, salt TEXT NOT NULL, hash TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY, username TEXT REFERENCES admins(username), expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS email_outbox(id INTEGER PRIMARY KEY, booking_id TEXT NOT NULL REFERENCES bookings(id), audience TEXT NOT NULL CHECK(audience IN ('customer','admin')), recipient TEXT, status TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0, next_attempt_at INTEGER NOT NULL DEFAULT 0, lease_until INTEGER NOT NULL DEFAULT 0, message_id TEXT, last_error_code TEXT, sent_at TEXT, UNIQUE(booking_id,audience));
    CREATE INDEX IF NOT EXISTS email_due ON email_outbox(status,next_attempt_at);
    CREATE INDEX IF NOT EXISTS trip_bookings ON bookings(boat_id,date,slot);`);
  if (
    !db
      .prepare('PRAGMA table_info(bookings)')
      .all()
      .some((column) => column.name === 'user_id')
  )
    db.exec('ALTER TABLE bookings ADD COLUMN user_id TEXT REFERENCES users(id)');
  db.exec(`CREATE TABLE IF NOT EXISTS payment_attempts(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),request_key TEXT UNIQUE NOT NULL,request_hash TEXT NOT NULL,payload TEXT NOT NULL,amount INTEGER NOT NULL,order_id TEXT UNIQUE,payment_id TEXT UNIQUE,status TEXT NOT NULL,expires INTEGER NOT NULL,booking_id TEXT REFERENCES bookings(id));
    CREATE TABLE IF NOT EXISTS seat_holds(boat_id TEXT,date TEXT,slot TEXT,seat TEXT,attempt_id TEXT REFERENCES payment_attempts(id),expires INTEGER NOT NULL,PRIMARY KEY(boat_id,date,slot,seat));`);
  db.exec(
    `CREATE TABLE IF NOT EXISTS database_metadata(id INTEGER PRIMARY KEY CHECK(id=1),instance_id TEXT NOT NULL,created_at TEXT NOT NULL);`,
  );
  db.prepare('INSERT OR IGNORE INTO database_metadata VALUES(1,?,?)').run(
    randomUUID(),
    new Date().toISOString(),
  );
  return db;
}
export function availability(db, input, excludeAttempt = '') {
  const boat = tripInfo(input);
  const rows = db
    .prepare(
      `SELECT seat FROM seats WHERE boat_id=? AND date=? AND slot=? UNION SELECT seat FROM seat_holds WHERE boat_id=? AND date=? AND slot=? AND expires>? AND attempt_id<>? ORDER BY seat`,
    )
    .all(
      boat.id,
      input.date,
      input.slot,
      boat.id,
      input.date,
      input.slot,
      Date.now(),
      excludeAttempt || '',
    );
  return {
    boatId: boat.id,
    date: input.date,
    slot: input.slot,
    bookedSeats: rows.map((row) => row.seat),
    remaining: boat.capacity - rows.length,
  };
}
export function createBooking(db, input, mode = 'seats', owner = null, receipt = null) {
  const { boat, name, email, phone, extras, seats, payment, hash } = validateBooking(input, owner);
  db.exec('BEGIN IMMEDIATE');
  try {
    const existing = db
      .prepare('SELECT record, request_hash, user_id FROM bookings WHERE request_key=?')
      .get(input.requestKey);
    if (existing) {
      if (existing.user_id !== (owner?.id || null) || existing.request_hash !== hash)
        throw new ApiError(409, 'This booking request was already used with different details.');
      db.exec('COMMIT');
      return JSON.parse(existing.record).pass;
    }
    const booked = availability(db, input, receipt?.attemptId).bookedSeats;
    const conflicts =
      mode === 'private' && booked.length ? seats : seats.filter((seat) => booked.includes(seat));
    if (conflicts.length)
      throw new ApiError(
        409,
        'Some seats were just booked. Choose different seats before trying again.',
        { bookedSeats: booked },
      );
    const record = buildBookingRecord(input, mode, owner, receipt);
    const { id, createdAt, pass } = record;
    db.prepare(
      'INSERT INTO bookings(id,request_key,request_hash,boat_id,date,slot,created_at,record,user_id) VALUES(?,?,?,?,?,?,?,?,?)',
    ).run(
      id,
      input.requestKey,
      hash,
      boat.id,
      input.date,
      input.slot,
      createdAt,
      JSON.stringify(record),
      owner?.id || null,
    );
    const reserve = db.prepare('INSERT INTO seats VALUES(?,?,?,?,?)');
    for (const seat of mode === 'private' ? N.seatLayout(boat).map((seat) => seat.id) : seats)
      reserve.run(boat.id, input.date, input.slot, seat, id);
    const queue = db.prepare(
      'INSERT INTO email_outbox(booking_id,audience,recipient) VALUES(?,?,?)',
    );
    queue.run(id, 'customer', email);
    queue.run(id, 'admin', null);
    if (receipt) {
      db.prepare(
        "UPDATE payment_attempts SET status='paid',booking_id=?,payment_id=? WHERE id=?",
      ).run(id, receipt.paymentId, receipt.attemptId);
      db.prepare('DELETE FROM seat_holds WHERE attempt_id=?').run(receipt.attemptId);
    }
    db.exec('COMMIT');
    return pass;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
export function setAdmin(db, username, password) {
  if (
    !/^[a-zA-Z0-9_.@-]{3,80}$/.test(username) ||
    typeof password !== 'string' ||
    password.length < 12 ||
    password.length > 256
  )
    throw new Error('Use a 3–80 character username and a 12–256 character password.');
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  db.prepare(
    'INSERT INTO admins VALUES(?,?,?) ON CONFLICT(username) DO UPDATE SET salt=excluded.salt,hash=excluded.hash',
  ).run(username, salt, hash);
  db.prepare('DELETE FROM sessions WHERE username=?').run(username);
}
export function login(db, username, password) {
  const admin = db.prepare('SELECT * FROM admins WHERE username=?').get(username);
  const candidate = scryptSync(password, admin?.salt || 'nautica-dummy-salt', 64);
  const expected = admin ? Buffer.from(admin.hash, 'hex') : Buffer.alloc(64);
  if (!admin || !timingSafeEqual(candidate, expected))
    throw new ApiError(401, 'Invalid admin username or password.');
  const token = randomBytes(32).toString('hex'),
    expires = Date.now() + 8 * 60 * 60 * 1000;
  db.prepare('DELETE FROM sessions WHERE expires<?').run(Date.now());
  db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(digest(token), username, expires);
  return { token, username };
}
export function authenticate(db, token) {
  if (!token || !/^[a-f0-9]{64}$/.test(token))
    throw new ApiError(401, 'Sign in as an administrator.');
  const session = db
    .prepare('SELECT username FROM sessions WHERE token_hash=? AND expires>?')
    .get(digest(token), Date.now());
  if (!session) throw new ApiError(401, 'Your admin session has expired. Sign in again.');
  return session.username;
}
export function adminBookings(db, query) {
  const clauses = [],
    args = [];
  for (const [key, column] of [
    ['boatId', 'boat_id'],
    ['date', 'date'],
    ['slot', 'slot'],
  ])
    if (query[key]) {
      clauses.push(`${column}=?`);
      args.push(query[key]);
    }
  if (query.q) {
    clauses.push(
      "(id LIKE ? OR json_extract(record,'$.customer.name') LIKE ? OR json_extract(record,'$.customer.email') LIKE ? OR json_extract(record,'$.customer.phone') LIKE ?)",
    );
    args.push(...Array(4).fill(`%${String(query.q).slice(0, 150)}%`));
  }
  const where = clauses.length ? ' WHERE ' + clauses.join(' AND ') : '';
  const total = db.prepare('SELECT count(*) AS total FROM bookings' + where).get(...args).total;
  const offset = Math.max(0, Math.min(1000000, parseInt(query.offset) || 0));
  const records = db
    .prepare(
      'SELECT record FROM bookings' + where + ' ORDER BY created_at DESC,id DESC LIMIT 50 OFFSET ?',
    )
    .all(...args, offset)
    .map((row) => JSON.parse(row.record));
  return { bookings: records, total, offset, limit: 50 };
}
