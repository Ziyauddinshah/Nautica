# Local testing

Use Node 24. No Android SDK is needed. MongoDB is now the application's database;
SQLite is retained only for migration tools and regression fixtures.

1. Run `npm ci` and copy `.env.example` to private `.env`.
2. Keep the development values `MONGODB_URI=mongodb://127.0.0.1:27017/?replicaSet=rs0`
   and `MONGODB_DB=nautica_test`.
3. Run `npm run mongo:local` in a separate terminal. The helper downloads the
   community MongoDB binary on first use, or uses `MONGOMS_SYSTEM_BINARY`. The
   binary must already be installed/cached to run without internet. Set
   `MONGOMS_DOWNLOAD_DIR` if you need a different cache directory.
4. For a genuinely new test database, run `npm run db:init`, then
   `npm run admin:create`. No default admin password is provided. For existing
   customers, follow the migration guide instead of creating empty records.
5. Run `npm run dev`; open http://localhost:3000, `/account` and `/admin`.

Local test data persists in `data/mongo-local`; stopping the helper does not delete
it. Never commit that directory, `.env` or database exports. Do not run a second
MongoDB process using the same data directory. If you installed Community Edition
separately, configure/initiate a replica set and set MONGODB_URI to it instead.
Standalone `mongod` is rejected because bookings require transactions.

## Acceptance checks

- Register a customer; choose a boat/date/time and one available seat per guest.
- In `PAYMENT_MODE=demo`, use test-only payment fields; no money is charged.
- Open another browser/device using the same backend URL, or another development
  app process configured with the same MongoDB database. Sign in again to the
  same account; its booking history must match. Cookies are specific to the URL.
- Book conflicting seats simultaneously. One request confirms and the other
  returns a conflict. Other seats and other trips remain available.
- Refresh/admin/account views or wait 15 seconds. Seat maps poll every 10 seconds.
- Restart the app process and local MongoDB helper: confirmed accounts/bookings
  remain in the persistent test data directory.
- Change/reset the password and verify prior sessions fail across app replicas.
  Reset email needs configured SMTP and a trusted origin; real password-reset
  links and internet testing should use HTTPS.
- Configure a local SMTP test transport or a controlled Gmail account; verify
  separate Hindi/English customer/admin confirmations and retry visibility.

`npm run share` serves the built frontend and backend on a trusted LAN and prints
LAN URLs. It is HTTP testing only; do not expose it to the internet. For real
customers use the shared HTTPS origin and online MongoDB.

## Automated checks

```sh
npm test
npm run test:mongodb
npm run build
```

The integration suite starts an isolated three-member local replica set. It does
not use MONGODB_URI/MONGODB_DB from your production environment and removes its
own test databases afterward. First-run binary download needs internet; a cached
binary or MONGOMS_SYSTEM_BINARY enables offline testing. Quorum-loss tests stop
and restart only suite-owned MongoDB processes.

See [SHARED_DATA.md](SHARED_DATA.md) for SQLite migration and shared online data,
[ARCHITECTURE.md](ARCHITECTURE.md) for service boundaries, and
[COMMERCIAL_LAUNCH.md](COMMERCIAL_LAUNCH.md) for live deployment. Graphical browser,
printing, QR scanning and real payment/email delivery still need manual acceptance
on the target environment.

### Boat registration

Visit `/owner` after signing in to register a real boat. Admin review is at `/admin/fleet`. The initial public catalogue is empty until a documented boat is approved; historical bookings remain available. For documents, local testing allows unscanned files, while production requires a private ClamAV service (`CLAMAV_HOST`, `CLAMAV_PORT`). See [FLEET_REGISTRATION.md](FLEET_REGISTRATION.md) for the India/Varanasi checklist and setup/upgrade requirements. No Android SDK is needed to run this web portal.

### Owner verification

Configure a private shared `MOBILE_OTP_SECRET` plus TextBee for real mobile codes. Aadhaar/alternative identity verification remains unavailable until you supply an authorized provider through the documented merchant bridge; no test code or client checkbox can grant real verification. Use isolated database fixtures/fake providers in automated tests, never the live production database. See [OWNER_VERIFICATION.md](OWNER_VERIFICATION.md).

### Cancellation, refunds and expiry reminders

The initial cancellation cutoff is 24 hours before departure, with admin approval. The server starts shared refund/reminder workers automatically; `npm run jobs:run` is available for an external scheduler and can execute approved real refunds. Use an isolated staging database and provider test keys for testing. See [AFTERCARE.md](AFTERCARE.md) for webhook subscriptions, renewal review, reconciliation and deployment steps.

### Admin MFA and monitoring

Set a private random 64-hex-character `ADMIN_MFA_ENCRYPTION_KEY` on every replica. Existing legacy admins require `npm run admin:mfa:reset` from a trusted interactive server terminal before enrollment at `/admin`. Use `/admin/operations` for alerts. Follow [ADMIN_SECURITY_OPERATIONS.md](ADMIN_SECURITY_OPERATIONS.md), including independent uptime monitoring and optional webhook delivery.

Customer bookings now require email verification even in manual local development.
Configure the existing Gmail SMTP settings and local `PUBLIC_ORIGIN` to receive a
verification link. Automated tests use explicitly verified synthetic fixtures and
fake senders; there is no runtime “mark everyone verified” switch. See
[CREDENTIAL_SECURITY.md](CREDENTIAL_SECURITY.md) for existing-account rollout and
production password-screening egress requirements.
