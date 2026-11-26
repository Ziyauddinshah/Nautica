/** @file Stores linked booking payment records and supports historical backfill. */
import { bookingPaymentFields } from '../domain/payment-record.js';
export async function saveBookingPayment(
  repository,
  booking,
  session,
  { attemptId, providerVerified = false } = {},
) {
  const collection = repository.c('payments'),
    fields = bookingPaymentFields(booking, { providerVerified });
  const existing = attemptId
    ? await collection.findOne({ _id: attemptId }, { session })
    : await collection.findOne(
        { $or: [{ bookingId: booking.id }, { requestKey: booking.requestKey }] },
        { session },
      );
  if (existing) {
    if (
      (existing.bookingId && existing.bookingId !== booking.id) ||
      existing.userId !== (booking.userId || null) ||
      existing.amount !== fields.amount ||
      (existing.currency && existing.currency !== fields.currency) ||
      (existing.requestHash && booking.requestHash && existing.requestHash !== booking.requestHash)
    )
      throw new Error(
        'Payment ownership, booking or amount conflict; reconcile before backfilling.',
      );
    if (existing.kind === 'booking_payment' && existing.recordVersion === 1)
      return { created: false, updated: false };
    if (!['paid', 'demo_paid', 'refunded', 'unknown'].includes(existing.status))
      throw new Error(
        'Unsettled payment conflicts with a confirmed booking; reconciliation is required.',
      );
    // Preserve a newer financial state and actual provider verification metadata.
    fields.status = existing.status;
    if (existing.createdAt) fields.createdAt = existing.createdAt;
    if (existing.paidAt) fields.paidAt = existing.paidAt;
    if (existing.reference) fields.reference = existing.reference;
    if (existing.verification) fields.verification = existing.verification;
    await collection.updateOne({ _id: existing._id }, { $set: fields }, { session });
    return { created: false, updated: true };
  }
  if (attemptId) throw new Error('Verified payment attempt is missing.');
  await collection.insertOne(
    { _id: 'booking:' + booking.id, requestKey: booking.requestKey, ...fields },
    { session },
  );
  return { created: true, updated: false };
}
export async function backfillPaymentRecords(repository) {
  const result = { created: 0, updated: 0, unchanged: 0 };
  const cursor = repository.c('bookings').find({}, { projection: { _id: 1 } });
  for await (const item of cursor) {
    const saved = await repository.transaction(async (session) => {
      const booking = await repository.c('bookings').findOne({ _id: item._id }, { session });
      return booking ? saveBookingPayment(repository, booking, session) : null;
    });
    if (saved) result[saved.created ? 'created' : saved.updated ? 'updated' : 'unchanged']++;
  }
  return result;
}
