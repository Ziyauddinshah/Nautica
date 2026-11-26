/** @file Runs shared refund reconciliation and document reminder jobs as an operator command. */
import { openRepository } from '../server/runtime.js';
import { Refunds } from '../server/aftercare/refunds.js';
import { aftercareWorker } from '../server/aftercare/worker.js';
import { createRazorpayGateway } from '../server/services/razorpay.js';
import { createTextbeeGateway } from '../server/services/textbee.js';
import { createSharedEmailService } from '../server/services/email.js';
import { createSmsService } from '../server/services/sms.js';
import { MongoOutboxStore } from '../server/repositories/mongo-outbox.js';
import { MongoSmsStore } from '../server/repositories/mongo-sms.js';
let repo, email, sms, worker;
try {
  repo = await openRepository();
  const textbee = createTextbeeGateway();
  repo.smsEnabled = textbee.enabled;
  repo.smsAdminEnabled = Boolean(textbee.config.adminTo);
  email = createSharedEmailService(new MongoOutboxStore(repo));
  sms = createSmsService(new MongoSmsStore(repo), textbee);
  const gateway = createRazorpayGateway({
    keyId: process.env.RAZORPAY_KEY_ID,
    keySecret: process.env.RAZORPAY_KEY_SECRET,
    webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET,
  });
  worker = aftercareWorker({
    refunds: new Refunds(repo, gateway),
    reminders: repo.reminders,
    emailService: email,
    smsService: sms,
    remindersEnabled: process.env.DOCUMENT_REMINDERS_ENABLED !== 'false',
  });
  const result = await worker.kick();
  if (result?.ok === false) throw new Error('Aftercare run failed; inspect shared jobs.');
  await Promise.all([email.drain(), sms.drain()]);
  console.log(
    'Aftercare pass completed. Inspect admin refund and document reminder status for provider outcomes.',
  );
} catch {
  console.error('Aftercare run failed. Check private server configuration and durable job status.');
  process.exitCode = 1;
} finally {
  await worker?.stop();
  await Promise.all([email?.stop(), sms?.stop()]);
  await repo?.close();
}
