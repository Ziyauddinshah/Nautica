# Cancellation, refunds and document-expiry reminders

## Customer policy and cancellation

The default policy is a **full refund for an eligible request made at least 24 hours before departure, subject to admin approval**. It covers the complete booking, including extras and the displayed port/pier fee. This version does not offer partial-seat cancellations or partial refunds. The merchant absorbs any non-returned payment-provider charges.

The deadline uses the boarding pier's time zone, not the customer's device time. The checkout displays the policy. New bookings and Razorpay checkout attempts retain a server-side policy snapshot; existing legacy bookings without a snapshot use the current published policy, shown before they request cancellation. Set `CANCELLATION_CUTOFF_HOURS=24` consistently on every replica. The supported alternative setting is `0`; changing it is a merchant policy change that requires review and coordinated rollout. Empty/unset values use 24.

Customers request cancellation from **My account → Booking history / Upcoming journeys**, giving a reason and explicitly accepting the policy. A pending request keeps its seats reserved but pauses boarding and pass export until review or withdrawal. Customers can withdraw a pending request to restore their ticket; a cancellation already approved cannot be undone. Withdrawal and approval are serialized to prevent restoring a resold seat. Admins filter bookings by **Pending cancellation requests** and approve or decline with a reason visible to the customer. An eligible request remains eligible if the admin reviews it after the deadline; the original request is recorded. Customers cannot create new online requests after their deadline and must use the merchant's support process for exceptions. Publish real support contacts and the legally reviewed policy before sales.

Admins can also cancel confirmed trips for operational reasons such as unsafe weather, with a full-refund decision and recorded reason. Approval atomically cancels the booking, releases only inventory entries owned by that booking (including every reserved seat for private-boat bookings), records the refund instruction and queues customer/admin notices. Repeating approval cannot create another refund or release seats resold to another booking. Declining a request leaves the reservation intact. Review reasons and actors are retained in private financial audit records.

Cancelled bookings remain in history, with a cancelled boarding-pass status. Pass export is blocked for cancelled copies loaded by the current application. Old downloaded images/QR codes can still exist: **do not accept them as proof of current validity**. Admins can select a booking and use **Check boarding validity**. `/api/admin/boarding/verify` checks the current booking, paid status, exact boat/date/slot, current boat eligibility and a boarding window from 30 minutes before departure through the journey's end. Demo tickets never permit real boarding. Integrate any future QR scanner with this authenticated server check.

## Real Razorpay refunds

The admin dashboard contains **Refund administration** for queued, pending, processed, failed, uncertain and manual-review cases. Customers see their own refund amounts, actual provider references and available bank references in booking/payment history. Refund amounts and currency come from the canonical payment record; client amounts and bank-account details are never accepted.

Approvals enqueue work. Workers on running app replicas issue normal-speed Razorpay refunds only for provider-verified captured payments, using one durable refund record per payment, a stable `X-Refund-Idempotency` key, stable receipt and identical request body. Actual provider calls run outside database transactions. The worker checks the payment and existing refunds before creating one. An existing full pending/processed refund can be adopted instead of issuing another.

A refund is marked `processed` / payment `refunded` only after authenticated Razorpay evidence matches the original payment ID, full amount and INR currency. Provider processing does not prove the bank has credited the customer yet; normal refunds can take several working days. ARN/RRN/UTR references are recorded when available, including later updates. Missing bank references are polled for up to seven days after processing; admins can refresh them subsequently.

The existing Razorpay callback endpoint is `/api/payments/razorpay/webhook`. Enable these events in the Razorpay dashboard using the existing private webhook secret:

- `payment.captured`, `order.paid`, `payment.failed`
- `refund.created`, `refund.processed`, `refund.failed`

Refund webhooks verify signatures and fetch current provider evidence rather than trusting payload amounts/status. Read-only polling also reconciles pending/uncertain outcomes, so a missed webhook does not imply a new refund. Duplicate or stale events cannot downgrade a completed refund or resurrect a cancelled booking.

Captured payments that never produced a booking remain visible under **Unbooked payment requiring refund**. An admin can approve their full refund with a reason. The original attempt's holds are released without touching other reservations. The customer sees the refund in payment history; repeated capture callbacks do not create a journey.

### Unknown, failed and manual-review outcomes

A timeout or expired send lease is uncertain, not proof of failure. The worker performs read-only reconciliation; it does not blindly create a new refund. An admin can reconcile using the provider's current data or supply an existing full Razorpay refund reference, which is checked against the exact payment/amount/currency. A customer-supplied success flag is never financial evidence.

An explicit admin retry of a recent uncertain request keeps the identical key/body. Uncertain requests older than 24 hours require provider reconciliation; this is a conservative application retry limit, not a claimed Razorpay key-retention guarantee. Only a provider-confirmed final failed refund gets a new generation/key, up to three generations. Admin decisions require a reason and are audited. Concurrent/stale retries cannot overwrite another decision.

External partial refunds or inconsistent historical payment evidence go to manual review. The application does not guess a remaining refund amount or combine unrelated provider records. Historical payments without a provider-verification record require staff to reconcile the original payment/provider data and, if necessary, perform the refund through the provider before attaching its verified full-refund reference. Do not edit financial statuses to make them appear completed. Resolve exceptional split/partial cases with your payment operations team before closing the case.

Demo cancellations create `simulated` refunds and `demo_refunded` payments. They never make a refund API call or claim that real money moved.

Official implementation references:

- [Razorpay normal refund idempotency](https://razorpay.com/docs/api/refunds/normal-refunds-idempotent/)
- [Razorpay refund APIs](https://razorpay.com/docs/api/refunds/)

Exercise the merchant's Razorpay test account, callback subscriptions and funding/failure paths in staging before accepting real sales. Automated tests use fake provider transports; they do not issue live refunds.

## Automated document reminders and renewal

The default shared scanner runs hourly while at least one application replica is running. Dates use India time. Owners and admins receive a reminder for the nearest current stage at **30, 14, 7 or 1 days before expiry**, on the expiry day, and once after expiry. A missed run catches up to the current stage, rather than sending every obsolete milestone. Documents without an expiry date are omitted. All registered boats with dated documents are considered, including drafts that need correction.

Reminder identity includes boat, document category, document version, expiry date and stage. MongoDB leases coordinate scanners and deterministic queue keys prevent duplicate reminder jobs across replicas/restarts. Existing Gmail SMTP and TextBee settings deliver email/SMS respectively; owner contacts come from the current account, and admin destinations stay server-side. Disabled delivery services leave jobs durably queued. Notices contain boat/category/date information, not certificate numbers, files, Aadhaar data or payment credentials.

Owners see dates, pending renewals and their own notification statuses in `/owner`; admins see both audiences in `/admin/fleet`. Admins can retry failed reminder emails and definite SMS rejections. Accepted/unknown SMS sends are not resent automatically. Superseded document/stage jobs are suppressed before delivery. SMTP has at-least-once delivery semantics: a worker crash after SMTP accepts a message but before acknowledgement can cause a duplicate email; deterministic Message-IDs help correlation but cannot guarantee inbox deduplication. TextBee acceptance is not handset delivery proof.

For an approved boat, uploading a replacement **stages a document renewal** and requires an authenticity declaration. The currently approved documents remain effective while an independent admin reviews the replacements. This works even with upcoming bookings. An upload alone never extends the published validity or reopens sales after expiry. Pending renewals are private and do not replace the customer's boat details.

Reviewers check authenticity/applicability using the existing checklist and record their decision. Approval cannot shorten an existing approved validity and must cover all confirmed journeys and active checkouts. Seat layout, capacity, registration identity and fares remain unchanged. Renewal approval updates the effective documents and audit trail, suppresses stale reminder jobs and notifies owner/admin. Rejection retains the previous approved documents. A suspended boat must resolve its suspension separately; renewal does not silently reinstate it.

Expired effective documents already block new bookings independent of the scanner. Existing journeys are not silently cancelled on document expiry; operations must resolve safety/permission issues and use the cancellation/refund workflow when needed.

## Running and deploying

`npm start` starts the refund worker and reminder scanner with the existing email/SMS workers. No new API keys are required beyond your existing Razorpay, Gmail SMTP and TextBee configuration. `DOCUMENT_REMINDERS_ENABLED=true` is the default; set false only if intentionally pausing the scanner. Refunds still require explicit admin approval.

For a managed scheduler or a separate worker process, run:

```
npm run jobs:run
```

This executes one bounded refund pass, the shared expiry scan when due, and notification delivery. It can process already-approved real refunds: use a staging database/credentials when testing it. Run it every minute or few minutes if no always-on app replica is available. Database leases make concurrent CLI/app passes safe. An offline app/database cannot deliver reminders; monitor worker availability and failed/uncertain jobs. The scanner's hourly due time is stored in MongoDB.

Upgrade every app replica together before reopening sales; older code lacks cancellation/pass and refund replay safeguards. Normal startup creates indexes and shared collections (`refunds`, `financial_audit`, `maintenance`) without resetting accounts or repeating migration. New financial transitions, seat releases, canonical payment summaries, audit entries and notice insertion commit transactionally. Never point automated tests at the live database or delete payment/booking collections as an upgrade step.

Private audit/notice records may contain customer reasons and contact information. Retain and protect them under the merchant's approved financial/privacy policy, with restricted access, TLS, encrypted storage and tested backups. Document retention/version limits continue to apply. This code does not determine legal policy, provider eligibility or commercial readiness on its own.
