# Shared online data and SQLite migration

All production app servers connect to the **same online MongoDB cluster and
MONGODB_DB**. Every customer device opens the same public HTTPS application URL
and signs in to its account. User sessions, accounts, bookings, payment state,
seat reservations, email jobs and rate limits live in MongoDB. Application
containers have no local customer database volume. Local Community MongoDB is
for testing only; production configuration rejects a local replica set and has
no offline database fallback.

GitHub stores code, not customers. `.env`, database files/exports, hashes and
credentials must remain private. Your old SQLite database may still be on its
original computer; cloning this branch does not import it automatically.

## New production business with no old customer data

1. Create one online Atlas cluster (or properly secured remote TLS replica set).
   Choose a tier, region and backup plan suitable for your reliability/volume
   requirements. A free tier has service limits; it is not an unlimited production
   availability guarantee.
2. Restrict network access to your app hosts, create a least-privilege database
   user, and set private MONGODB_URI/MONGODB_DB on every app replica. Use a valid
   TLS connection string; secrets stay on the server.
3. Set NODE_ENV=production, PUBLIC_ORIGIN to the shared HTTPS origin and
   PAYMENT_MODE=disabled until providers/business details are ready.
4. Run `npm run db:init` once, then `npm run admin:create`. Initialization creates
   schema/indexes and a ready marker. It preserves existing initialized data and
   refuses an incomplete migration. Run `npm run db:status` to check access/counts.
5. Start app replicas behind one HTTPS ingress. See COMMERCIAL_LAUNCH.md.

Do not initialize an empty database if you intend to recover existing customers.
The application refuses to start against an uninitialized/incompatible namespace.

## Import the existing SQLite data

The import is a controlled cutover to a **new MongoDB database**, not a live
synchronizer or an automatic merge.

1. Find the original SQLite database on the original computer. Previous versions
   defaulted to `data/nautica.sqlite`; an older server started from another working
   directory may have used a file there. Set legacy NAUTICA_DB to the actual
   absolute path for the backup tool. Do not create a new empty source.
2. Stop sales and reconcile any in-flight Razorpay transactions. Stop all old
   application writers and email workers during final backup/cutover. Keep the
   original file archived; do not run old and new systems accepting independent
   reservations after the cutover.
3. Create a consistent private backup:

   ```sh
   npm run sqlite:backup -- /PRIVATE_PATH/nautica-transfer.sqlite
   ```

   On an old checkout the command may still be named `db:backup`. The SQLite source
   must exist. Do not copy only the main file from a running WAL database.
4. Set the destination's private online MONGODB_URI and a **new, empty**
   MONGODB_DB. Do **not** run db:init on this destination first. Run:

   ```sh
   npm run db:migrate:sqlite -- /PRIVATE_PATH/nautica-transfer.sqlite
   npm run db:status
   ```

   The importer opens SQLite read-only, validates integrity, gates the destination
   as `migrating`, creates indexes, copies data, checks user/booking/seat counts and
   marks the namespace `ready` only when the import completes. App replicas cannot
   start against a partial import. Existing initialized destinations are refused,
   even if empty; existing data is never overwritten or merged.
5. Compare counts and database identity, sign in to a customer and admin account,
   inspect bookings/payment references, occupied seats and notification state.
   Ownership is preserved by user ID; old guest bookings are not claimed by email.
   Password hashes are preserved. Sessions and password-reset links are **not**
   imported, so users must sign in again.
6. Reconcile captured payments and unfinished provider orders before reopening.
   Active unexpired holds/attempts are imported, but the importer cannot prove
   external provider settlement. Sent email jobs stay sent; an interrupted sending
   job may retry with its stable Message-ID. Check for duplicates/manual refunds.
7. Configure every app server with the same destination, point the public URL at
   the new replicas, and reopen traffic only after acceptance checks.

If an import fails, the source stays unchanged and the destination stays gated.
Inspect the cause offline and retry into another new namespace. There is no
implicit resume, merge, rollback of external payments, or destructive cleanup.
If several old computers have independent databases, reconcile accounts, seats
and payments before selecting/importing the authoritative copy.

## MongoDB backup and recovery

Use your Atlas/managed cluster's supported backup/point-in-time recovery plan, or
MongoDB's supported `mongodump`/`mongorestore` tooling for a self-managed replica
set. Availability, retention and restore features depend on the chosen tier.
Protect exports with encryption and access controls; they contain customer data
and password hashes. Never put a MongoDB backup in the repository or `dist`.
The `sqlite:backup`/`sqlite:restore` commands operate on legacy SQLite files only;
they do not back up or restore MongoDB.

Test restoration into an isolated namespace, validate metadata/indexes/counts and
reconcile payments/email activity since the backup before switching every app
replica together. Never run replicas against different point-in-time restores.
A backup is not the same as replication: neither replaces the other.

## What happens without database connectivity

The app refuses confirmations without primary/majority access, readiness reports
unavailable, and sensitive API errors remain generic. It does not create an empty
local database, accept offline seat bookings or acknowledge an unconfirmed write.
An ambiguous timeout can mean the write already committed: check history or
retry the same request key before creating a new payment. Visible account/admin
pages refresh every 15 seconds and on focus/reconnect; seat maps poll every 10
seconds. These screens are snapshots, not instantaneous live pushes.

## Add payment records to an already migrated database

Do not repeat the SQLite import or initialize/drop the current database. Update
all application replicas to the new code before backfilling, so every history
query recognizes linked payment records. On the machine with working Atlas
connectivity run `npm run db:backfill:payments`, then `npm run db:status`.
Restart the app so new bookings automatically save their payment record.

This writes only payment records linked to existing bookings. It makes no
gateway charges, sends no emails and does not alter bookings or seats. Demo
records remain demo; imported real-payment summaries remain historical unless
there was a verified gateway attempt. A repeated run creates no duplicates and
stops rather than overwrite financial/ownership conflicts. New SQLite imports
already create these records before the destination becomes ready.
