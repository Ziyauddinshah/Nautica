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
