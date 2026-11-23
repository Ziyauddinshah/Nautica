# Nautica — React, Node and shared MongoDB

Boat bookings with numbered seat selection, English/हिन्दी UI, customer accounts,
booking/payment history, Razorpay INR checkout, Gmail SMTP notifications and an
admin passenger/seat manifest. The `web` branch runs without the Android SDK.

Production application replicas use **one online MongoDB database**. Accounts,
sessions, bookings, payment attempts, email jobs and rate limits are shared.
There is no automatic SQLite, browser-storage or offline fallback.

## Local testing

Use Node 24, then:

```sh
npm ci
```

Copy `.env.example` to `.env`. In a separate terminal, start a local MongoDB
Community test replica set:

```sh
npm run mongo:local
```

The helper downloads a MongoDB binary on first use, or uses `MONGOMS_SYSTEM_BINARY`
if you have a compatible local `mongod`. Subsequent offline runs require that
binary to be cached/installed. Test data persists in `data/mongo-local`, and the
helper binds to loopback. A replica set is required even for local transaction
tests; a standalone `mongod` is rejected.

In the application terminal:

```sh
npm run db:init
npm run admin:create
npm run dev
```

Open http://localhost:3000, `/account` for customer history, or `/admin` for admin
access. No administrator password is bundled. `db:init` is for a deliberately new
database. **Existing SQLite users must migrate before running an empty system:**
see [SHARED_DATA.md](SHARED_DATA.md).

Use a separate testing database and local demo payments; do not mix test and
production customer records. `npm run share` serves the built app on a trusted LAN
for testing; internet access must use the HTTPS deployment.

## Check a configured Atlas connection

Keep credentials only in private `.env`, using `MONGODB_URI` and `MONGODB_DB`.
Run `npm run db:connect` to test DNS/TLS/authentication and inspect schema readiness
without creating collections, indexes or user data. Lowercase `uri`/`database`
variables are not application settings. If credentials were committed to Git,
rotate them; deleting the current values does not remove historical exposure.

## Multi-server production

Configure private `MONGODB_URI` and `MONGODB_DB` for one online Atlas cluster or a
TLS-enabled remote MongoDB replica set. Set `NODE_ENV=production`, an exact HTTPS
`PUBLIC_ORIGIN`, and production payment/email settings. The application requires
an initialized compatible schema and rejects local production MongoDB, TLS
bypasses and weak consistency options.

The included Compose/Caddy setup supports multiple application replicas:

```sh
docker compose up -d --scale app=2
```

Complete the initialization/migration and domain/proxy settings in
[COMMERCIAL_LAUNCH.md](COMMERCIAL_LAUNCH.md) first. This does not provision an Atlas
account, hosting or a domain. Application servers have no local database volume;
Caddy's volumes store TLS configuration/certificates only.

## Consistency and service boundaries

Transactions use snapshot reads and majority journaled commits. Trip inventory
updates serialize competing seat reservations. Unique request/payment indexes,
transactional outbox inserts and fenced email leases coordinate replicas. Shared
MongoDB rate limits and server-side sessions work across load-balanced requests.

When a partition removes database quorum, confirmations stop rather than create
conflicting local bookings. Unknown commits retry the commit without rerunning
the business callback; clients must check history/retry the same request before
starting a new payment. This prioritizes consistency, not uninterrupted write
availability during a partition. SMTP delivery is at least once across crashes,
not an exactly-once external side effect.

[ARCHITECTURE.md](ARCHITECTURE.md) documents storage, payment gateway and outbox
interfaces for future providers and services.

## Validation

```sh
npm test
npm run test:mongodb
npm run build
```

`npm test` runs UI, configuration, privacy and legacy SQLite migration-regression
checks. `test:mongodb` starts an isolated **three-member real MongoDB replica set**
and checks cross-server sessions, bookings, holds, callbacks/webhooks, shared
limits, email coordination, migration, unknown commits and quorum loss/recovery.
It never connects to your configured production database. The binary download is
needed only once (or provide `MONGOMS_SYSTEM_BINARY`).

Read [LOCAL_SETUP.md](LOCAL_SETUP.md), [SHARED_DATA.md](SHARED_DATA.md) and
[COMMERCIAL_LAUNCH.md](COMMERCIAL_LAUNCH.md) before launch. Real boat inventory,
policies, live provider acceptance checks and hosting still need operator setup.

## Customer journey and payment history

At `/account`, customers can open Upcoming journeys, Previous bookings, all
Booking history and Payment history. Upcoming includes a trip currently in
progress until its one-hour journey ends. Classification uses the boarding
pier’s local time zone (India, Singapore or Lake Como/Rome), independent of the
application host’s time zone. Cancelled bookings appear with previous bookings.

Filtering/counts and pagination run on the server for the signed-in owner. Payment
history combines booking payment snapshots—including migrated SQLite bookings—with
unconfirmed/refund-required attempts, without duplicating confirmed gateway attempts.
Amounts remain INR, and simulated payments stay explicitly marked as demo. No
new data migration or separate payment documents are required to display existing
booking payment history. Views refresh automatically and support English/Hindi.

## Stored payment information

New bookings save a linked record in MongoDB `payments` in the same transaction
as the booking and seats. Gateway payments enrich their existing attempt instead
of creating a second receipt; local demo bookings create a clearly labelled demo
record. Stored fields include booking/user IDs, INR amount, method/provider,
reference, status, timestamps, boat/trip summary and safe method metadata. Card
numbers, CVVs, UPI credentials and provider secrets are not stored.

For existing Atlas bookings whose payment summary exists only in `bookings`, run
on the computer with working Atlas access:

```sh
npm run db:backfill:payments
npm run db:status
```

Backfill is repeatable and coordinated transactionally across replicas. It
creates missing records/enriches compatible ones, preserves newer financial
states, and stops on ownership/amount/request conflicts requiring reconciliation.
It does not charge a customer, send emails, or change bookings/seats. Historical
records are labelled historical/demo rather than falsely marked provider-verified.
New SQLite imports perform this backfill before marking the destination ready.
Payment history prefers linked records and falls back to old booking snapshots
until backfill, without counting a confirmed payment twice.

## TextBee booking SMS

Set these in private `.env` (never in `VITE_` variables or `.env.example`):

```dotenv
SMS_ENABLED=true
TEXTBEE_API_KEY=YOUR_PRIVATE_KEY
TEXTBEE_DEVICE_ID=YOUR_DEVICE_ID_FROM_TEXTBEE
SMS_ADMIN_TO=YOUR_ADMIN_PHONE_WITH_PLUS_COUNTRY_CODE
SMS_DEFAULT_COUNTRY_CODE=91
```

`SMS_ADMIN_TO` is optional; without it only the customer gets SMS. Restart all
app replicas after configuration changes, using the same settings on each.
`npm run sms:verify` checks the API key/selected device with a read-only request;
it sends no SMS. Then make a controlled booking using your own destination number.
Existing bookings are not retroactively texted. SMS jobs are created only for new
bookings while SMS is configured/enabled. Demo bookings are explicitly labelled.

[TextBee's current send API](https://textbee.dev/docs/sending-sms/sending-sms) uses
`POST /api/v1/gateway/send-sms` with `deviceId` and a private `x-api-key` header.
The Android TextBee phone needs an active SIM, SMS permissions, power and internet;
messages use its SIM/carrier, and charges/plan limits apply. Hindi/long messages
can use multiple SMS segments. No Android SDK is required for the Nautica web app.

Destinations should be E.164 (`+` and country code). Only Indian 10-digit local
numbers are expanded automatically when SMS_DEFAULT_COUNTRY_CODE=91; for other
countries supply the full international number. Wrong/missing numbers fail the
SMS job without undoing the booking or preventing its email confirmation.

Jobs in MongoDB `sms_outbox` commit with bookings, use distinct customer/admin IDs
and fenced leases, and run separately from email. The app shows queued, accepted,
dispatched, sent, delivered, failed and unknown outcomes. Acceptance is **not**
delivery; the worker polls the selected device's batch/message status. It checks
each accepted message up to 100 times (about eight hours), then use TextBee's
history to investigate later outcomes. Changing the sender device pauses tracking
of old-device batches; use that device's provider history for reconciliation.

Only definite rate-limit rejections retry automatically (at most three attempts).
Send timeouts, malformed acknowledgements and expired sending leases become
unknown and are not automatically resent. No provider idempotency guarantee is
assumed. A crash after provider acceptance can lose the local batch reference;
inspect TextBee history before taking any manual resend action. The admin button
retries rejected requests without an accepted batch; it never resends unknown,
accepted, sent or delivered jobs. Provider-reported failures after acceptance
must be investigated in TextBee. No exactly-once carrier delivery is promised.

Messages include booking reference, boat, date/time, seats, fare and payment/demo
status, without passwords, reset links, API credentials or full payment references.
API keys, device IDs, admin destinations and raw provider responses are excluded
from browser APIs. Both English and Hindi are supported. SMS is for booking
notifications; password reset continues to use the existing email workflow.
