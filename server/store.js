import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, chmodSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import * as N from '../src/domain/booking.js';

export class ApiError extends Error { constructor(status, message, details = {}) { super(message); this.status = status; this.details = details; } }
export const digest = value => createHash('sha256').update(value).digest('hex');
const bankNames = ['SBI','HDFC Bank','ICICI Bank','Axis Bank','Bank of Baroda','Canara Bank','Kotak Mahindra','Punjab National Bank','Union Bank'];
export function openStore(filename = process.env.NAUTICA_DB || resolve('data/nautica.sqlite')) {
  if (filename !== ':memory:') mkdirSync(dirname(filename), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(filename);
  if (filename !== ':memory:') chmodSync(filename, 0o600);
  db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS bookings(id TEXT PRIMARY KEY, request_key TEXT UNIQUE NOT NULL, request_hash TEXT NOT NULL, boat_id TEXT NOT NULL, date TEXT NOT NULL, slot TEXT NOT NULL, created_at TEXT NOT NULL, record TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS seats(boat_id TEXT, date TEXT, slot TEXT, seat TEXT, booking_id TEXT REFERENCES bookings(id), PRIMARY KEY(boat_id,date,slot,seat));
    CREATE TABLE IF NOT EXISTS admins(username TEXT PRIMARY KEY, salt TEXT NOT NULL, hash TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY, username TEXT REFERENCES admins(username), expires INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS trip_bookings ON bookings(boat_id,date,slot);`);
  return db;
}
export function tripInfo(input) {
  if(!input||typeof input!=='object'||Array.isArray(input))throw new ApiError(400,'Invalid trip request.');
  const boat = N.boats.find(boat => boat.id === input.boatId);
  if (!boat || !N.slots.includes(input.slot) || typeof input.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new ApiError(400, 'Choose a valid boat, date and time slot.');
  const parsed = new Date(`${input.date}T12:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0,10) !== input.date) throw new ApiError(400, 'Invalid calendar date.');
  return boat;
}
export function availability(db, input) {
  const boat = tripInfo(input);
  const rows = db.prepare('SELECT seat FROM seats WHERE boat_id=? AND date=? AND slot=? ORDER BY seat').all(boat.id, input.date, input.slot);
  return { boatId: boat.id, date: input.date, slot: input.slot, bookedSeats: rows.map(row => row.seat), remaining: boat.capacity - rows.length };
}
function paymentSummary(payment) {
  if (!payment || typeof payment !== 'object') throw new ApiError(400, 'Choose a supported payment method.');
  if (payment.type === 'upi' && ['GPay','PhonePe','Paytm','BHIM'].includes(payment.provider)) return { type: 'upi', provider: payment.provider, method: `UPI · ${payment.provider}` };
  if (payment.type === 'bank' && bankNames.includes(payment.bank)) return { type: 'bank', bank: payment.bank, method: `Net banking · ${payment.bank}` };
  if (payment.type === 'card' && ['VISA','MASTERCARD','RUPAY','AMEX','CARD'].includes(payment.network) && /^\d{4}$/.test(payment.last4)) return { type: 'card', network: payment.network, last4: payment.last4, method: `${payment.network} · ${payment.last4}` };
  throw new ApiError(400, 'Choose a supported payment method.');
}
export function createBooking(db, input, mode = 'seats') {
  const boat = tripInfo(input);
  if (input.date < N.localDate()) throw new ApiError(400, 'Choose today or a future date.');
  if (!N.validSeats(boat, input.seats, input.guests)) throw new ApiError(400, 'Choose one valid, distinct seat for every guest.');
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
  const phone = typeof input.phone === 'string' ? input.phone.trim() : '';
  if (name.length < 2 || name.length > 80 || email.length > 150 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !/^\+?[\d ()-]{7,25}$/.test(phone) || phone.replace(/\D/g,'').length < 7 || phone.replace(/\D/g,'').length > 15) throw new ApiError(400, 'Enter a valid passenger name, email and phone number.');
  if (!Array.isArray(input.extras) || input.extras.some(id => !N.extras.some(extra => extra.id === id))) throw new ApiError(400, 'Invalid trip extras.');
  if (typeof input.requestKey !== 'string' || !/^[a-zA-Z0-9-]{16,80}$/.test(input.requestKey)) throw new ApiError(400, 'Missing booking request key.');
  const extras = [...new Set(['safety', ...input.extras])].sort();
  const seats = [...input.seats].sort();
  const payment = paymentSummary(input.payment);
  const canonical = { boatId: boat.id, date: input.date, slot: input.slot, guests: input.guests, seats, name, email, phone, extras, payment };
  const hash = digest(JSON.stringify(canonical));
  db.exec('BEGIN IMMEDIATE');
  try {
    const existing = db.prepare('SELECT record, request_hash FROM bookings WHERE request_key=?').get(input.requestKey);
    if (existing) {
      if (existing.request_hash !== hash) throw new ApiError(409, 'This booking request was already used with different details.');
      db.exec('COMMIT');return JSON.parse(existing.record).pass;
    }
    const booked = availability(db, input).bookedSeats;
    const conflicts = (mode === 'private' && booked.length) ? seats : seats.filter(seat => booked.includes(seat));
    if (conflicts.length) throw new ApiError(409, 'Some seats were just booked. Choose different seats before trying again.', { bookedSeats: booked });
    const id = `NTC-${randomUUID().replaceAll('-','').slice(0,12).toUpperCase()}`;
    const createdAt = new Date().toISOString();
    const pricing = N.amounts(boat, extras);
    const paymentInfo = { ...payment, status: 'demo_paid', reference: `DEMO-${randomUUID()}`, paidAt: createdAt, amount: pricing.total, currency: 'INR' };
    const pass = { id, boatId: boat.id, date: input.date, slot: input.slot, guests: input.guests, seats, name, extras, total: pricing.total, currencyBase: 'INR', method: payment.method, paymentStatus: 'demo_paid', paymentReference: paymentInfo.reference, createdAt, serverConfirmed: true };
    const record = { id, status: 'confirmed', createdAt, bookingMode: mode, customer: { name, email, phone }, boat: { ...boat }, trip: { date: input.date, slot: input.slot, guests: input.guests, seats }, extras, pricing, payment: paymentInfo, pass };
    db.prepare('INSERT INTO bookings VALUES(?,?,?,?,?,?,?,?)').run(id, input.requestKey, hash, boat.id, input.date, input.slot, createdAt, JSON.stringify(record));
    const reserve = db.prepare('INSERT INTO seats VALUES(?,?,?,?,?)');
    for (const seat of (mode === 'private' ? N.seatLayout(boat).map(seat => seat.id) : seats)) reserve.run(boat.id,input.date,input.slot,seat,id);
    db.exec('COMMIT');return pass;
  } catch (error) { db.exec('ROLLBACK');throw error; }
}
export function setAdmin(db, username, password) {
  if (!/^[a-zA-Z0-9_.@-]{3,80}$/.test(username) || typeof password !== 'string' || password.length < 12 || password.length > 256) throw new Error('Use a 3–80 character username and a 12–256 character password.');
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  db.prepare('INSERT INTO admins VALUES(?,?,?) ON CONFLICT(username) DO UPDATE SET salt=excluded.salt,hash=excluded.hash').run(username,salt,hash);
  db.prepare('DELETE FROM sessions WHERE username=?').run(username);
}
export function login(db, username, password) {
  const admin = db.prepare('SELECT * FROM admins WHERE username=?').get(username);
  const candidate = scryptSync(password, admin?.salt || 'nautica-dummy-salt', 64);
  const expected = admin ? Buffer.from(admin.hash,'hex') : Buffer.alloc(64);
  if (!admin || !timingSafeEqual(candidate, expected)) throw new ApiError(401, 'Invalid admin username or password.');
  const token = randomBytes(32).toString('hex'), expires = Date.now() + 8*60*60*1000;
  db.prepare('DELETE FROM sessions WHERE expires<?').run(Date.now());
  db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(digest(token), username, expires);
  return { token, username };
}
export function authenticate(db, token) {
  if (!token || !/^[a-f0-9]{64}$/.test(token)) throw new ApiError(401, 'Sign in as an administrator.');
  const session = db.prepare('SELECT username FROM sessions WHERE token_hash=? AND expires>?').get(digest(token), Date.now());
  if (!session) throw new ApiError(401, 'Your admin session has expired. Sign in again.');
  return session.username;
}
export function adminBookings(db, query) {
  const clauses=[],args=[];
  for (const [key,column] of [['boatId','boat_id'],['date','date'],['slot','slot']]) if(query[key]){clauses.push(`${column}=?`);args.push(query[key]);}
  if (query.q) {clauses.push("(id LIKE ? OR json_extract(record,'$.customer.name') LIKE ? OR json_extract(record,'$.customer.email') LIKE ? OR json_extract(record,'$.customer.phone') LIKE ?)");args.push(...Array(4).fill(`%${String(query.q).slice(0,150)}%`));}
  const where=clauses.length?' WHERE '+clauses.join(' AND '):'';
  const total=db.prepare('SELECT count(*) AS total FROM bookings'+where).get(...args).total;
  const offset=Math.max(0,Math.min(1000000,parseInt(query.offset)||0));
  const records=db.prepare('SELECT record FROM bookings'+where+' ORDER BY created_at DESC,id DESC LIMIT 50 OFFSET ?').all(...args,offset).map(row=>JSON.parse(row.record));
  return { bookings:records, total, offset, limit:50 };
}
