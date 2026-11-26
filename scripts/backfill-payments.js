/** @file Repeatable historical payment-record backfill for existing bookings. */
import { openRepository } from '../server/runtime.js';
import { backfillPaymentRecords } from '../server/repositories/payment-records.js';
let repository;
try {
  repository = await openRepository();
  const result = await backfillPaymentRecords(repository);
  console.log(
    `Payment records: ${result.created} created, ${result.updated} enriched, ${result.unchanged} already complete.`,
  );
  console.log('No charges or emails were sent. Booking and seat records were not changed.');
} catch {
  console.error(
    'Payment backfill stopped. Check connectivity and reconcile conflicting payment records before retrying. Already completed records are safe to rerun.',
  );
  process.exitCode = 1;
} finally {
  await repository?.close();
}
