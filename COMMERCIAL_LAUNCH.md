# Multi-server commercial launch

Nautica now uses MongoDB for shared online production storage and local MongoDB
Community replica sets for testing. The code is not an already provisioned Atlas
account, hosting deployment, approved merchant account or complete legal/business
operation. Domain and hosting have not been chosen; no live payment/email has
been accepted in this workspace.

## Database and migration

Read [SHARED_DATA.md](SHARED_DATA.md). Production requires server-only MONGODB_URI,
an explicit MONGODB_DB, validated TLS and a replica set/sharded cluster supporting
transactions. All app servers must use the same cluster/namespace. Configure
least-privilege credentials, app-host network rules, backups, alerts and a tested
restore procedure. Estimate the total connection budget (up to 30 per app process)
and choose database capacity/regions accordingly.

Initialize a genuinely new database with db:init, or import existing SQLite data
into a new namespace with db:migrate:sqlite. Never bypass a failed migration's
readiness gate or silently point one replica at an empty alternative database.
The runtime does not use SQLite; legacy tools are for migration/regression only.

## Application replicas and HTTPS

Set the following privately on the deployment hosts:

```dotenv
NODE_ENV=production
STORAGE_PROVIDER=mongodb
MONGODB_URI=mongodb+srv://YOUR_PRIVATE_ATLAS_CONNECTION_STRING
MONGODB_DB=nautica
NAUTICA_DOMAIN=YOUR_REAL_HOSTNAME
PUBLIC_ORIGIN=https://YOUR_REAL_HOSTNAME
PAYMENT_MODE=disabled
NAUTICA_PROXY_TOKEN=YOUR_RANDOM_SECRET_OF_AT_LEAST_32_CHARACTERS
```

Use the real provider connection string with its credentials properly URL-encoded.
Do not commit it or send it to the browser. Generate the proxy token locally, for
example with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`,
and store it privately. It is not a customer login token.

With Docker Compose and a domain resolving to the ingress host, open ports 80/443:

```sh
docker compose build
# New database ONLY; existing users must follow the migration guide instead.
docker compose run --rm --no-deps app node scripts/db-init.js
docker compose run --rm --no-deps app node scripts/admin-create.js
docker compose up -d --scale app=2
```

Caddy discovers app replica addresses through Docker DNS, distributes requests and
injects the private proxy token. The backend accepts forwarded client IPs only
with that proof or from configured TRUSTED_PROXY_IPS; forged headers are ignored.
This allows shared per-client rate limits without trusting arbitrary headers.
The API port is not published. Configure any CDN/outer ingress's forwarding rules
and trusted peers correctly; do not assume its unverified client-IP header is safe.
For multiple physical hosts, deploy the same app image/config behind your chosen
HTTPS load balancer and pass the proxy proof from a trusted ingress, or configure
explicit trusted proxy socket IPs. There is no cookie affinity requirement. Every replica must use the same public
origin, merchant/webhook secrets, pricing release and compatible schema. Drain
checkouts before changing prices or merchant settings; fare changes during an
open checkout can require manual refund review.

Caddy storage volumes contain TLS state only; user data stays in online MongoDB.
Removing/replacing an application container does not remove MongoDB records. Never
run local MongoDB inside production app containers as a fallback. A single Compose
ingress host is still a failure domain; plan redundant ingress/hosts if required.

Run `npm run production:check`, `npm test`, `npm run test:mongodb` and `npm run build`.
The production check validates cluster/schema reachability and settings, not legal
readiness, merchant approval, inbox delivery or load capacity. Docker builds in
this workspace previously failed because npm inside the image did not trust its
TLS interception chain; configure a trusted build CA or validate the image on the
chosen host. TLS verification stays enabled. Compose configuration is validated
separately; no deployed image/HTTPS endpoint is claimed here.

## Provider and business setup before sales

- Replace sample fleet, reviews, illustrative seating plans and destinations with
  actual boats, capacities, schedules/time zones, safety equipment and prices.
  The current 5% port fee is not a tax invoice. Operator weather/cancellation,
  rescheduling and destination timezone workflows need business-specific work.
- Supply business identity, support contact, privacy/retention/deletion procedures,
  terms and cancellation/refund policies. Review local permissions, insurance,
  taxes/GST and invoicing obligations with qualified advisers.
- Activate Razorpay and configure automatic capture, live keys and a separate
  webhook secret. Subscribe to payment.captured/order.paid at
  `/api/payments/razorpay/webhook`. Exercise controlled live payment, callback loss,
  signed webhook retries, reconciliation and refund handling before sales.
- Configure Gmail SMTP using an App Password and private admin recipient. Run
  `npm run email:verify` and verify both languages, customer/admin confirmations
  and password-reset delivery. Review sending limits and spam handling.
- Enable `PAYMENT_MODE=razorpay` only after acceptance. Production rejects demo
  payments and test keys. Orders/capture checks are INR; USD is an indicative
  display using a fixed ₹83/USD conversion, not a USD charge or live FX quote.
- Create individual admin credentials and restrict admin access as appropriate.
  Admin MFA is implemented and required; complete enrollment as described in ADMIN_SECURITY_OPERATIONS.md. Customer email verification is required before new purchases; see CREDENTIAL_SECURITY.md. Arrange password
  recovery and incident response without sharing accounts.
- Perform target-host security, accessibility, browser/printing/QR and load checks.

## Partitions, payments and delivery

The system prioritizes reservation consistency. A partition without a reachable
majority can make requests unavailable. It cannot guarantee both uninterrupted
writes and consistent reservations through every partition. Do not weaken write
concern, read from stale secondaries or accept offline bookings to hide an outage.

Seat holds last 15 minutes. Captured payments confirm only matching INR amounts
and available seats. Late captures with conflicts become refund_required, visible
in admin payment attention. Staff can approve their full refund in the application;
the shared worker issues and reconciles Razorpay refunds with durable status and
customer/admin notices. Unknown, historical or external partial-refund cases require
manual review. Complete the staging and operational checks in AFTERCARE.md.
Unknown order/commit outcomes must be investigated or retried idempotently; never
blindly charge again after a timeout. Provider reconciliation remains necessary
for external payments whose notification never reaches the application.

Email outbox claims are fenced across replicas, with stable Message-IDs, bounded
SMTP timeouts and retries. SMTP delivery remains at least once after a crash or
partition at the acceptance/acknowledgement boundary; duplicate delivery is possible.
MongoDB transaction retries never send SMTP or create provider orders themselves.

Monitor `/api/health` as readiness, primary/replica/quorum state, failovers, pool
usage, latency, expired leases, failed emails and captured payments without
bookings. Synchronize clocks. Keep logs private and exclude credentials, reset
links, SMTP bodies, full customer payloads and provider secrets. Shut down replicas
gracefully and test failover/restore procedures before expanding capacity.

- Complete [fleet registration and authority review](FLEET_REGISTRATION.md) for every real boat. Verify the India/Varanasi policy with competent local authorities, including applicability to manual boats. Deploy approval enforcement to all replicas, configure a private updated ClamAV service, and reconcile upcoming legacy/sample bookings before reopening sales. Document uploads do not grant legal permission.

- Finish authorized Aadhaar/alternative identity provider onboarding and bridge integration described in OWNER_VERIFICATION.md. Verify consent/alternative and revocation handling, protect the shared OTP secret, and exercise real mobile delivery in staging. Existing boats require verified owners; link/re-review ownerless legacy boats and reconcile active bookings/checkouts before reopening sales. The prepared bridge alone is not Aadhaar verification.

- Publish the 24-hour full-refund policy and real support contacts. Test cancellation approval, inventory release, signed refund webhooks, uncertain/final-failed refunds, current boarding checks and document-renewal reminders in staging. Keep at least one worker running or schedule `npm run jobs:run`; see AFTERCARE.md.

- Complete admin MFA rollout and backup the encryption key separately. Test operational alert delivery and configure an external uptime monitor. See ADMIN_SECURITY_OPERATIONS.md; no in-process monitor can cover every process being offline.

- Run the encrypted backup restoration drill and small synthetic pilot, then complete
  the live five-guest operator run sheet in [BACKUP_RESTORE_PILOT.md](BACKUP_RESTORE_PILOT.md).
  A simulation does not replace an actual backup drill or controlled live acceptance.
