# One backend, the same data on every device

Nautica stores accounts, password hashes, sessions, bookings, payment records,
seat reservations and email jobs in its backend SQLite database. Cloning the
GitHub repository on a second computer does **not** copy that database. The file
is deliberately excluded from Git because it contains private customer data.
An empty database on the second computer does not mean the first copy was erased.

Every phone, browser and computer must open the **same running backend URL** and
sign in to the same account. Customers see their own bookings; admins see all
bookings. Separate localhost installations, independent Docker volumes and
static-only frontend hosting do not synchronize databases.

## Share on a trusted local network

On the computer that has your existing data, run:

```sh
npm ci
npm run db:status
npm run share
```

`share` builds the frontend and serves it and the API together. It prints the
computer's LAN URLs, such as `http://192.168.1.25:3001`. Open that **same URL** on
all devices on the same trusted network; allow port 3001 through the host's local
firewall if needed. Keep that one computer running. Sign in with your existing
account on each device. Do not start another independent server on the second
computer. `localhost` on your phone refers to the phone, not the first computer.

This HTTP mode is for trusted LAN testing only. It is not a secure internet
hosting solution. Use HTTPS below for real customers, payments and password-reset
links. Do not port-forward the LAN test server to the internet.

## Persistent storage safeguards

- Local default: `data/nautica.sqlite` relative to the application directory.
  Relative `NAUTICA_DB` settings also use that directory; changing the shell's
  working directory no longer silently selects another database.
- Production requires an **absolute** `NAUTICA_DB` pointing to persistent storage,
  for example `/var/lib/nautica/nautica.sqlite`, and an existing initialized database.
  Missing storage or an empty uninitialized file stops startup instead of silently
  creating a replacement. Check your disk/volume mount before initializing anything.
- `npm run db:init` explicitly creates a new database, or initializes/upgrades an
  existing one without dropping records. Use it only for a deliberate first setup.
  It does not recover records from another computer.
- `npm run db:status` reports the private database path, identity, integrity result
  and record counts on the server console. It never creates a missing database.
  Compare identities when diagnosing an accidental switch. Independent databases
  have different identities; backup copies retain the source identity.
- SQLite uses WAL, full synchronous commits, foreign keys and transaction/unique
  constraints to prevent duplicate seat reservations. These protect committed
  records; private backups and reliable disk storage are still required.

## One HTTPS server for access from anywhere

Choose one host with a persistent disk and a domain pointing to it. The supplied
`compose.yaml` runs one application instance with Caddy for HTTPS. The application
port stays private; only Caddy publishes ports 80/443. You need Docker Compose,
working DNS and incoming access to those ports. This does not provision a host,
register a domain or publish a deployment automatically.

Copy `.env.example` to `.env`, keep it private and set:

```dotenv
NODE_ENV=production
NAUTICA_DOMAIN=your-real-domain.example
PUBLIC_ORIGIN=https://your-real-domain.example
NAUTICA_DB=/app/data/nautica.sqlite
PAYMENT_MODE=disabled
```

Replace the domain with your own. Keep payments disabled until the commercial
launch requirements and Razorpay setup are completed. Configure Gmail separately
for real confirmations and password reset. Do not use the sample `PAYMENT_MODE=demo`
in production.

For a **new business with no existing customer database**, initialize explicitly:

```sh
docker volume create nautica-data
docker compose build
docker compose run --rm --no-deps app node scripts/db-init.js
docker compose run --rm --no-deps app node scripts/admin-create.js
docker compose up -d
```

For **existing data**, use the migration procedure below instead of `db:init`.
Then open `https://your-real-domain.example` on every device and sign in normally.
The `nautica-data` volume is external and has a fixed name, so a normal Compose
rebuild, restart, project-directory change or `down -v` does not delete it. Explicitly
removing the volume, deleting its host or losing its disk still destroys its data
unless you have a backup. Do not run multiple replicas or put SQLite on a shared
network filesystem; use a managed transactional database before scaling beyond
one application host.

The earlier Docker build attempt in this workspace failed on an npm TLS trust
chain. TLS verification remains enabled; the image/HTTPS deployment still needs
validation on the chosen host. The Compose configuration is checked separately.

## Move the existing data without losing it

1. Locate the original computer and run `npm run db:status` from its original
   Nautica checkout. If an older version was started from another working directory,
   its database may be under that directory; point NAUTICA_DB at that original
   absolute file path instead of initializing a replacement. Stop new bookings there while migrating so both hosts cannot
   accept different reservations. Do not run `db:init` on an empty second machine
   expecting it to download customers from GitHub.
2. On the original server, create a consistent backup:

   ```sh
   npm run db:backup -- /PRIVATE_PATH/nautica-transfer.sqlite
   ```

   Use an absolute private path outside the web root. Transfer it securely to the
   new host; it contains personal information, password hashes and session records.
   Never upload it to GitHub or serve it from `dist`.
3. With the destination application stopped and its target database **absent**,
   restore to your configured `NAUTICA_DB`:

   ```sh
   npm run db:restore -- /PRIVATE_PATH/nautica-transfer.sqlite
   npm run db:status
   ```

   In the Compose setup, create the external volume and build the image first,
   then mount the backup read-only for import:

   ```sh
   docker compose run --rm --no-deps -v /PRIVATE_PATH/nautica-transfer.sqlite:/restore/backup.sqlite:ro app node scripts/db-restore.js /restore/backup.sqlite
   docker compose run --rm --no-deps app node scripts/db-status.js
   ```

   `db:restore` verifies integrity and required Nautica tables, restores through
   SQLite's backup API and publishes the file atomically. It refuses to overwrite
   an existing target or WAL/SHM files. For an existing destination, preserve it
   separately and restore to a new private path/volume; do not delete it blindly.
   This copies one authoritative database; it does not merge independent user or
   booking databases. If both computers have distinct bookings, reconcile them
   before choosing the authoritative copy to avoid duplicate seats or payments.
4. Compare record counts and database identity against the original, then start
   the new backend and check account login, history, occupied seats and admin
   records. Keep the original safely archived. Reconcile Razorpay activity and
   pending email jobs around the migration before reopening sales.
5. Direct every device to the new shared HTTPS URL. Moving domains may require
   signing in again because cookies belong to each domain. Account records move
   with the database; login cookies do not need to be copied between browsers.

## Refresh and consistency

The backend is the authority for account data, prices, seats and payments. API
responses are not browser-cached. Booking submission checks/reserves seats in a
transaction; concurrent conflicting submissions cannot both confirm.

Visible customer/account/admin views refresh every 15 seconds and when the page
regains focus, becomes visible or reconnects. Seat availability polls every 10
seconds and is checked again when reserving. Changes are not instantaneous live
pushes; another screen may show the previous snapshot until refresh. Network
errors are displayed rather than saving a new private browser copy, and a
transient network failure does not discard an already known login. Unauthorized
sessions are cleared. When diagnosing a discrepancy, verify the shared URL,
account and server database identity first.

Automated tests cover independent authenticated sessions, concurrent bookings,
restart persistence, consistent backup/import, missing/empty storage refusal,
working-directory changes and browser refresh behavior. They do not constitute
an already running shared hosting service. Hosting/domain setup is still needed
for access over the internet.
