# Architecture and extension points

## Runtime composition

`server/index.js` is the composition root. It opens MongoDB through `runtime.js`,
constructs a `MongoRepository`, injects `MongoPaymentStore` into the payment service,
injects `MongoOutboxStore` into the email worker, and passes these dependencies to
the HTTP application. The React API contract and authorization rules stay stable.

- `server/domain/booking.js`: trip/contact/seat validation, server-authoritative
  pricing and booking/pass construction, independent of the MongoDB driver.
- `server/domain/accounts.js`: account validation/password checks and public projection.
- `server/repositories/mongo*.js`: MongoDB queries, indexes, transactions, shared
  sessions/limits, inventory, payment storage and fenced outbox operations.
- `server/services/payments.js`: provider-neutral payment coordination. Its storage
  port supplies `reserve`, `owned`, `creationUnknown`, `attachOrder`, `get`,
  `findOrder`, `recover`, `confirm` and `attention`. External calls stay outside transactions.
- `server/services/razorpay.js`: current gateway port. Supplies `createOrder`,
  normalized `getPayment`, `verifyCallback` and `readWebhook`, plus public key/name
  metadata. Provider secrets never become API responses.
- `server/services/email.js`: worker using an outbox port (`claim`, `record`,
  `succeed`, `fail`, `retry`) and an injected mail transport (`sendMail`, optional `close`).
- `server/views.js`: explicit response projections; repositories and persistence
  objects are never serialized wholesale.

To add a payment provider, implement the gateway port, its checkout UI adapter and
secure provider-specific HTTP/config wiring, then run the same reservation,
verification, idempotency and partition tests. To use another mail service, supply
a transport adapter or a service using the same fenced outbox port. A different
database needs repository/payment/outbox implementations with the same transactional
guarantees; changing a connection string alone is not sufficient.

The older `store.js`, `users.js`, `payments.js`, `email.js` and SQLite adapter remain
for migration tools and regression tests. The production entry point does not
open SQLite and does not fall back to these adapters on connection failures.

## Consistency model

All clients use one logical MongoDB database and one public application origin.
Applications are stateless with respect to customer records, sessions and rate
limits. MongoDB 7+ must be a replica set or sharded cluster supporting transactions; MongoDB 8 is used in integration tests.
Application replicas may run on different hosts behind the same HTTPS ingress.

- Driver reads select the primary with majority read concern. Authentication and
  availability/readiness point reads use linearizable reads with a bounded server
  execution time. Transactions read snapshots and commit with `w: majority`,
  journaling and a commit acknowledgement timeout.
- A trip inventory document is keyed by boat/date/slot. Each mutation writes its
  version, causing competing transactions to conflict and retry. Within the same
  transaction the service checks occupied seats, writes the booking, confirms the
  payment attempt, updates inventory and inserts two durable outbox jobs.
- Held-seat deadlines use MongoDB's timestamp from the inventory mutation; expiry
  at the authoritative reservation check uses that same server clock. Confirmed
  seats never expire. Public availability is a periodically refreshed snapshot;
  booking submission is always checked again transactionally.
- Unique indexes enforce one user email, booking request, payment request, provider
  order and provider payment. Outbox job IDs are deterministic per booking/audience.
  TTL cleanup for sessions/resets/limits is housekeeping only; expiry is explicitly
  checked during authentication/reset/limit enforcement.
- Transactions retry labeled transient failures within a bounded attempt/time
  budget. An `UnknownTransactionCommitResult` retries only the original commit,
  never the callback. An unresolved result is returned as unavailable, not mapped
  to a definitive seat conflict, refund or new booking. Repeating the same request
  can recover an already committed result.
- MongoDB time drives rate-limit windows and worker leases. Lease completion updates
  require the claim token, so an obsolete worker cannot acknowledge another claim.
  Keep host clocks synchronized for token expiry and operational timestamps.

## Partitions and external side effects

Partition tolerance cannot be disabled. If an application cannot reach the
majority-elected primary or obtain the required acknowledgement, it refuses
confirmations and readiness fails. There is no offline booking queue, local mirror
or secondary-read fallback. Some reads/writes become unavailable to preserve the
seat reservation guarantees. A majority partition may continue operating.

Razorpay calls and SMTP sends cannot participate in MongoDB transactions. A remote
order creation that times out is retained as uncertain, never blindly recreated
with the same request key. Signed notifications can recover an order association
from the attempt ID in gateway notes. Only a fetched captured payment matching the
order, INR currency and amount can finalize a booking. Provider retries are handled
idempotently; refunds are still a manual operational workflow.

Email jobs use 120-second database leases, stable Message-ID values, five attempts
and backoff. Ordinary competing workers do not send the same leased job. A crash
or partition after SMTP acceptance but before recording `sent` can cause a retry
and duplicate email. Exactly-once SMTP delivery cannot be guaranteed by a database
lease. SMTP timeouts are shorter than the lease; protect database access and monitor
expired leases and exhausted retries.

## Operational constraints

The inventory key is a natural contention boundary: unrelated trips proceed
independently. More application replicas do not remove contention for one trip.
Do not shard collections casually; unique indexes and transaction routing need a
reviewed shard-key strategy. Scale database tier, connection pools and indexes
with measured demand. Each app process has a maximum pool of 30 connections.

Index/schema initialization must complete before serving traffic. Migration uses
a new gated namespace and marks it ready only after counts/integrity/index checks.
There is no distributed live dual-write or automatic merge of independent local
SQLite databases. Upgrade incompatible schema versions through an explicit rollout
rather than having app replicas silently adopt them.

## TextBee SMS

The SMS worker (`services/sms.js`) uses an injected TextBee gateway and
`MongoSmsStore`. Its `sms_outbox` is separate from the email outbox. Configured
app replicas insert deterministic customer/admin jobs in the booking transaction;
old bookings and database migrations do not trigger SMS. Outbox claims use server
time and token-fenced acknowledgements. Only configured future bookings are queued.

A provider acceptance records the selected device/batch internally and begins
read-only delivery polling. A sending lease that expires becomes unknown, never
an automatic resend. The provider currently documents no send idempotency key;
we do not invent one or treat a timeout as a rejection. Only HTTP 429 rejections
retry automatically, with bounded attempts. This prioritizes avoiding duplicate
SMS at the cost of manual review for ambiguous sends. Polling never causes a send.
Keys/device IDs/recipient routing/provider responses are not browser API fields;
notification views expose only channel, audience, safe status/timestamps and the
admin retry-eligibility boolean. Password reset stays on email. See README.md
for configuration, message segmentation, Android-phone operation and limits.

Before restoring a MongoDB backup, reconcile TextBee sends since that backup
before restarting SMS workers: a restored pending job may have been sent after
the snapshot. Database restoration cannot roll back carrier side effects.
