# Developer onboarding and code navigation

## What runs where

Nautica's `web` branch is React + Vite in the browser, a Node HTTP server, and
shared MongoDB storage. It needs no Android SDK. Node 24 is the recommended runtime.
The browser calls same-origin `/api` endpoints and renders public response fields.
The server owns authentication, permissions, pricing, inventory and provider
credentials. A replica set or sharded MongoDB cluster is required for transactions.

Read the guides in this order:

1. [README](../README.md): install and run.
2. [LOCAL_SETUP](../LOCAL_SETUP.md): environment and local replica set.
3. [ARCHITECTURE](../ARCHITECTURE.md): composition, transactions and extension ports.
4. [File reference](FILE_REFERENCE.md): purpose and location of each file.
5. [Access/privacy/security](ACCESS_PRIVACY_SECURITY.md): safe third-party access.
6. The feature guide for the change: fleet, owner verification, aftercare, admin
   security, shared storage or backup/pilot, linked from the reference.

## Safe first run

Run `npm ci`, copy `.env.example` to a private `.env`, and use a separate local test
replica set (`npm run mongo:local`) or a dedicated development Atlas database.
Replace the example Atlas placeholders; for local tests use the commented loopback
URI and `MONGODB_DB=nautica_test`. `db:init` deliberately initializes a new database;
never use it to repair or replace existing production data.

Generate private MFA/OTP keys as described in the relevant guides. Create an admin
with `npm run admin:create`, enroll its authenticator, and save recovery codes
privately. Then `npm run dev`; visit `/`, `/account`, `/owner`, `/admin/fleet`, `/admin` or
`/admin/operations` as applicable. Roles are checked by server APIs. A frontend URL
or hidden button is never authorization.

Use demo payments only in development. Leave optional providers disabled until
configured for the intended test environment; missing identity/scanner settings
may deliberately block owner registration or document approval. Do not bypass the
workflow by manually approving records. Tests have explicit fixtures for such
cases. No sample fleet record constitutes legal permission to operate a boat.

See [the API orientation](API_GUIDE.md) before connecting a new frontend or partner.

## Follow a booking through the code

`src/App.jsx` coordinates the booking UI. Components collect a trip and numbered
seats; `src/lib/api.js` sends requests with the language and same-origin marker.
`server/app.js` checks the request and session before invoking services.
`server/services/payments.js` coordinates the provider through its injected gateway
and `MongoPaymentStore`. MongoDB transactions recheck capacity and commit the
booking, inventory, payment and notification jobs together. Outbox workers contact
SMTP/TextBee outside that transaction. `server/views.js` and domain response
builders expose only intended fields back to the browser.

A browser callback alone never proves capture. Signed webhooks are validated and
provider evidence is checked. An uncertain external outcome requires reconciliation;
replaying an idempotent operation differs from creating a second payment/refund.
See [AFTERCARE](../AFTERCARE.md) for cancellation and refund transitions.

## Where to make changes

| Change                 | Start here                                     | Checks to preserve                                            |
| ---------------------- | ---------------------------------------------- | ------------------------------------------------------------- |
| Layout or translations | `src/components`, `src/styles.css`, `src/i18n` | Visibility, Hindi, accessibility, no private state in storage |
| API/permissions        | `server/app.js`, feature `http.js`             | Session, ownership, MFA, origin and size limits               |
| Booking rules          | `server/domain/booking.js`, repositories       | Authoritative price, seat lock, shared transaction            |
| Payment provider       | `server/services`, payment repository          | Signature, amount/order/currency, idempotency, reconciliation |
| Fleet/documents        | `server/fleet`, `server/verification`          | Owner verification, private files, scan, independent review   |
| Notifications          | `server/services`, outbox repositories         | Stable job identity, fenced lease, unknown outcome handling   |
| Admin/alerts           | `server/security`, `server/operations`         | MFA challenge separation, safe alert payloads, audit history  |
| Storage/recovery       | `server/repositories`, `server/recovery`       | Majority writes, no fallback, isolated restore drill          |

## Test layers and limitations

`npm test` runs browser tests and server tests. Some old server tests intentionally
use SQLite fixtures; runtime production uses MongoDB. `test:mongodb` exercises
shared sessions, real local replica-set transactions, quorum loss and provider
fakes. `test:recovery` executes encrypted backup/restore commands against disposable
databases. `pilot:simulate` combines these checks and the frontend build, producing
a private report. None proves live inbox/handset delivery, legal compliance, Atlas
backup readiness or a successful real pilot.

Prettier makes code readable consistently. `security:check` is a limited tracked
artifact/browser boundary check, not a complete secret or vulnerability scanner.
Use a proper repository secret scanner, dependency alerts and review as additional
controls. `docs:generate` maintains the file index; edit its descriptions when
adding a new kind of module. `docs:check` detects a stale index.

## Troubleshooting without exposing data

Use `db:connect` for connectivity and `db:status` for readiness/counts. Share only
sanitized error codes and timestamps, never connection URIs, `.env`, cookies,
reset links, identities, document bytes or provider payloads. See the relevant
feature guide before retrying an uncertain operation. `production:check` validates
configuration/readiness, not actual provider delivery or business/legal approval.
