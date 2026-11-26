/** @file Legacy SQLite payment adapter for isolated regression tests. */
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { ApiError, availability, validateBooking, createBooking } from './store.js';
import { amounts, seatLayout } from '../src/domain/booking.js';
import { validSignature } from './domain/signature.js';
export { validSignature } from './domain/signature.js';
export function createPayments(
  db,
  { keyId, keySecret, webhookSecret, transport = fetch, mode = 'seats' } = {},
) {
  const enabled = Boolean(keyId && keySecret && webhookSecret);
  async function gateway(path, body) {
    let response;
    try {
      response = await transport('https://api.razorpay.com/v1/' + path, {
        method: body ? 'POST' : 'GET',
        headers: {
          Authorization: 'Basic ' + Buffer.from(keyId + ':' + keySecret).toString('base64'),
          'Content-Type': 'application/json',
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(12000),
      });
    } catch {
      throw new ApiError(503, 'Payment service is unavailable. Please try again.');
    }
    if (!response.ok) throw new ApiError(503, 'Payment service is unavailable. Please try again.');
    return response.json();
  }
  function own(id, user) {
    const row = db
      .prepare('SELECT * FROM payment_attempts WHERE id=? AND user_id=?')
      .get(id, user.id);
    if (!row) throw new ApiError(404, 'Payment not found.');
    return row;
  }
  async function order(input, user) {
    if (!enabled) throw new ApiError(503, 'Online booking is currently unavailable.');
    const data = { ...input, email: user.email, payment: { type: 'upi', provider: 'GPay' } };
    const prepared = validateBooking(data, user),
      amount = amounts(prepared.boat, prepared.extras).total;
    if (db.prepare('SELECT id FROM bookings WHERE request_key=?').get(input.requestKey))
      throw new ApiError(409, 'This booking request was already used with different details.');
    let row = db
      .prepare('SELECT * FROM payment_attempts WHERE request_key=?')
      .get(input.requestKey);
    if (row) {
      if (row.user_id !== user.id || row.request_hash !== prepared.hash)
        throw new ApiError(409, 'This booking request was already used with different details.');
      if (row.order_id && row.status === 'created' && row.expires > Date.now())
        return publicOrder(row);
      throw new ApiError(409, 'This payment attempt has expired. Start a new booking.');
    }
    const id = randomUUID(),
      expires = Date.now() + 15 * 60 * 1000;
    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare('DELETE FROM seat_holds WHERE expires<=?').run(Date.now());
      const booked = availability(db, data).bookedSeats;
      if (
        (mode === 'private' && booked.length) ||
        prepared.seats.some((seat) => booked.includes(seat))
      )
        throw new ApiError(
          409,
          'Some seats were just booked. Choose different seats before trying again.',
          { bookedSeats: booked },
        );
      db.prepare(
        "INSERT INTO payment_attempts(id,user_id,request_key,request_hash,payload,amount,status,expires) VALUES(?,?,?,?,?,?,'creating',?)",
      ).run(id, user.id, input.requestKey, prepared.hash, JSON.stringify(data), amount, expires);
      for (const seat of mode === 'private'
        ? seatLayout(prepared.boat).map((s) => s.id)
        : prepared.seats)
        db.prepare('INSERT INTO seat_holds VALUES(?,?,?,?,?,?)').run(
          data.boatId,
          data.date,
          data.slot,
          seat,
          id,
          expires,
        );
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
    // On a network timeout retain the attempt; never create a second remote order with the same request key.
    try {
      const result = await gateway('orders', {
        amount,
        currency: 'INR',
        receipt: id,
        notes: { attempt_id: id },
      });
      if (typeof result.id !== 'string' || result.amount !== amount || result.currency !== 'INR')
        throw new ApiError(503, 'Payment service is unavailable. Please try again.');
      db.prepare("UPDATE payment_attempts SET order_id=?,status='created' WHERE id=?").run(
        result.id,
        id,
      );
      return publicOrder(own(id, user));
    } catch (error) {
      db.prepare("UPDATE payment_attempts SET status='creation_unknown' WHERE id=?").run(id);
      throw error;
    }
  }
  function publicOrder(row) {
    return {
      attemptId: row.id,
      orderId: row.order_id,
      keyId,
      amount: row.amount,
      currency: 'INR',
      expires: row.expires,
    };
  }
  async function settle(row, paymentId) {
    if (row.status === 'paid')
      return JSON.parse(
        db.prepare('SELECT record FROM bookings WHERE id=?').get(row.booking_id).record,
      ).pass;
    if (row.status === 'refund_required')
      throw new ApiError(
        409,
        'Payment received but seats could not be confirmed. Contact support for a refund.',
      );
    const payment = await gateway('payments/' + encodeURIComponent(paymentId));
    if (
      payment.id !== paymentId ||
      payment.order_id !== row.order_id ||
      payment.amount !== row.amount ||
      payment.currency !== 'INR' ||
      payment.status !== 'captured'
    )
      throw new ApiError(
        409,
        'Payment is awaiting confirmation. Check your booking history before retrying.',
      );
    const latest = db.prepare('SELECT * FROM payment_attempts WHERE id=?').get(row.id);
    if (latest.status === 'paid')
      return JSON.parse(
        db.prepare('SELECT record FROM bookings WHERE id=?').get(latest.booking_id).record,
      ).pass;
    const user = db.prepare('SELECT id,email FROM users WHERE id=?').get(row.user_id);
    try {
      const input = JSON.parse(row.payload),
        prepared = validateBooking(input, user);
      if (amounts(prepared.boat, prepared.extras).total !== row.amount)
        throw new ApiError(409, 'The fare changed before confirmation.');
      return createBooking(db, input, mode, user, { attemptId: row.id, paymentId });
    } catch (error) {
      if (error instanceof ApiError && [400, 409].includes(error.status)) {
        db.prepare(
          "UPDATE payment_attempts SET status='refund_required',payment_id=? WHERE id=? AND status<>'paid'",
        ).run(paymentId, row.id);
        throw new ApiError(
          409,
          'Payment received but seats could not be confirmed. Contact support for a refund.',
        );
      }
      throw error;
    }
  }
  async function verify(input, user) {
    const row = own(input.attemptId, user);
    if (
      row.order_id !== input.orderId ||
      !validSignature(input.signature, row.order_id + '|' + input.paymentId, keySecret)
    )
      throw new ApiError(400, 'Payment verification failed.');
    return settle(row, input.paymentId);
  }
  async function webhook(raw, signature) {
    if (!enabled || !validSignature(signature, raw, webhookSecret))
      throw new ApiError(400, 'Invalid payment notification.');
    let event;
    try {
      event = JSON.parse(raw);
    } catch {
      throw new ApiError(400, 'Invalid payment notification.');
    }
    if (!['payment.captured', 'order.paid'].includes(event.event)) return;
    const payment = event.payload?.payment?.entity;
    if (!payment?.order_id || !payment?.id) return;
    const row = db.prepare('SELECT * FROM payment_attempts WHERE order_id=?').get(payment.order_id);
    if (row)
      try {
        await settle(row, payment.id);
      } catch (error) {
        if (
          db.prepare('SELECT status FROM payment_attempts WHERE id=?').get(row.id)?.status !==
          'refund_required'
        )
          throw error;
      }
  }
  function attention() {
    return db
      .prepare(
        "SELECT id,order_id AS orderId,payment_id AS paymentId,status,amount,'INR' AS currency,json_extract(payload,'$.name') AS name,json_extract(payload,'$.email') AS email,json_extract(payload,'$.phone') AS phone FROM payment_attempts WHERE status='refund_required' ORDER BY expires DESC LIMIT 100",
      )
      .all();
  }
  return { enabled, order, verify, webhook, attention };
}
