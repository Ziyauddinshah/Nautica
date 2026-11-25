# Backup restoration and small launch pilot

## Encrypted MongoDB backup and isolated restoration

For a small database, `npm run db:backup -- /PRIVATE_BACKUP_DIRECTORY/nautica.nbk`
creates a versioned AES-256-GCM encrypted snapshot of all collections, including
private boat-document binary data, password hashes, booking/payment history,
seat inventory, outboxes and encrypted MFA secrets. Index definitions are included.
The command uses configured server-only MongoDB settings and never writes source
records. It refuses an existing output file and destinations inside this project.
Create the private destination directory first; keep it outside every web root.

Generate a separate 32-byte random hex `BACKUP_ENCRYPTION_KEY` locally, using the
same generation command as the MFA guide, and store it in server-only secrets.
Do not reuse the MFA key. Escrow both keys separately from the backup. Losing the
backup key makes the archive unreadable; losing the MFA key makes restored admin
secrets unusable. No keys or customer data belong in a report or Git.

Document reads share a MongoDB snapshot transaction. Freeze collection/index
migrations during capture; keep the database small enough to finish within the
cluster transaction lifetime. The encrypted archive has a 32 MiB payload limit
and is assembled in memory. This is a bounded small-installation tool, not
incremental backup, point-in-time recovery, or an Atlas backup replacement. Use
managed snapshots/PITR or supported MongoDB tools as volume grows. Custom collection
options/views are rejected instead of silently losing their configuration.

Test an archive on a trusted engineering host with development dependencies:

```sh
npm ci
npm run db:restore:test -- /PRIVATE_BACKUP_DIRECTORY/nautica.nbk
```

This command starts a **disposable local MongoDB 8.0.16 replica set**, imports the
archive, compares every BSON document checksum and index definition, and tests
decryption of configured admin MFA secrets using `ADMIN_MFA_ENCRYPTION_KEY`.
It requires the real MFA key if the archive contains enrolled admins. No configured
Atlas destination is used or modified. TTL deletion is disabled for exact historic
comparison. No HTTP server, booking/refund/notification worker, SMTP or SMS client
is started, so restored pending jobs cannot send or move money. The local server
is stopped and its temporary database removed even on a normal test failure.

The first run needs a MongoDB binary download or an approved cached binary and
sufficient local disk. The trusted host temporarily holds decrypted data; protect
its disk/temp storage and clean it after a host crash. A failed or interrupted
backup file is not evidence of a successful backup: only an authenticated,
completed restore drill is evidence. Copy successful archives to encrypted private
off-host storage; track retention, last successful backup time and alert failures
using your hosting scheduler. These scripts do not install a backup schedule.

For actual disaster cutover, use your managed database recovery procedure into a
new isolated cluster. Keep all workers and sales stopped until an operator has
reconciled provider captures/refunds and notification acceptance since the recovery
point. Revoke restored sessions/reset tokens, review OTP/MFA replay state, inspect
pending jobs/leases, validate documents/approvals and set a distinct operations
environment identity before starting services. Restore and test the separate MFA
key, then switch **all** replicas together. Never merge an old inventory snapshot
into current bookings. The drill intentionally offers no production overwrite CLI.

## Repeatable simulated pilot

```sh
npm run pilot:simulate
```

Runs application tests, the isolated encrypted restore test, the multi-server
integration suite, and a production frontend build. Stops on the first failing
stage and writes `data/pilot-simulation.json`, a private machine-readable report
with mode, stage results and timing. Report fields explicitly state that simulation
does not approve a live launch, verify real provider delivery or restore a
production backup. No `.env` is loaded by the pilot runner itself; test fixtures
use temporary databases and fake provider transports.

The dedicated pilot scenario uses five synthetic guests and two repositories
sharing a replica set. Each purchases a distinct seat through simulated provider
capture. Five competing seat attempts fail; duplicate callbacks/webhooks yield
exactly five bookings/payments. Each guest sees only their own history. Two fake
email workers deliver the ten customer/admin confirmations once in this normal
run. An encrypted backup of the completed pilot is restored into a fresh namespace;
booking/payment histories and occupied seats are verified through the repository.
Other integration cases cover cancellation/refund reconciliation, SMS uncertainty,
owner/doc approval, MFA, alerts and quorum loss. This is correctness testing at
small scale, not a throughput benchmark or proof of inbox/handset delivery.

## Real small launch pilot: operator run sheet

Hosting/domain and a real approved boat/trip must be selected first. Keep general
sales closed until these checks pass. Use one approved Varanasi boat, one scheduled
journey and at most five invited consenting adults, within its approved capacity.
Use staff-controlled accounts in staging first; real customers and real charges
require the merchant/operator's controlled live deployment.

Record the following privately, with an operator, timestamp, evidence reference
and pass/fail for each item. Do not put PII, account secrets or payment payloads in
this repository.

1. Complete `COMMERCIAL_LAUNCH.md` and `production:check`; confirm HTTPS, one shared
   database across replicas, enrolled individual admins, lawful reviewed boat
   documents/owner verification, real seating/prices/policies and working support.
2. Restore a recent **actual** backup using the isolated drill. Record recovery
   point, elapsed restore time, record/index results and MFA key check; agree RPO
   and RTO targets with the operator. Synthetic fixtures alone do not satisfy this.
3. Invite up to five guests. Record language/device coverage, readability and
   assisted booking feedback. Verify Hindi/English login, history and upcoming trip.
4. Start with Razorpay test mode in staging. Verify one successful booking, one
   declined attempt, contention for a seat, callback interruption/webhook recovery,
   customer/admin Gmail and TextBee receipt, and no exposed private information.
5. After staging acceptance, the operator may run a small controlled real INR
   payment and eligible cancellation/admin-approved refund. Confirm actual provider
   settlement/refund and inbox/handset receipt; automated fake-provider results are
   insufficient. Never retry an uncertain charge/refund blindly.
6. Check boarding validity and seats across two clients, fleet document expiry
   reminders, admin MFA/recovery, incident acknowledgement and external uptime
   monitoring. Review the operational dashboard before/after the trip.
7. Observe for at least 24 hours and through refund/provider finality as needed.
   Reconcile guest booking/payment records against Razorpay, pending jobs and
   operator records. Record support issues and guest feedback.

Stop the pilot immediately for a seat conflict, unauthorized data access,
unexplained money movement or a safety/document issue. Close sales using the
existing disabled-payment mode on every replica and communicate via authorized
support channels; preserve payment reconciliation, history and aftercare access.
Do not roll back the database to undo a booking. Resume only after reconciliation
and a verified fix. Expand only with operator sign-off, no unexplained captured
payments/refunds, consistent inventory, confirmed receipts and a successful actual
backup drill. Record the pilot outcome rather than treating the simulation as a
commercial launch approval.

## Recorded simulation: 25 November 2026

Completed at 13:18 IST. All four stages passed: 70 frontend tests, 84 server tests,
one encrypted restoration integration test (including real CLI round trips),
56 multi-server integration tests, and the production build: **211 tests total**.
The complete simulated run took about 89 seconds; the isolated restoration test
stage took about 3.9 seconds with cached local binaries. These timings are fixture
measurements, not a production recovery-time promise. The dedicated five-guest
booking/payment/history/inventory restoration scenario passed.

The private machine-readable report is `data/pilot-simulation.json` (Git-ignored).
The production build retains the existing JavaScript chunk-size advisory.
No production Atlas backup was taken/restored, no real guest was invited, and no
live payment, refund, email or SMS was sent. Actual production-backup restoration
and controlled live pilot acceptance remain open pending deployment/boat/provider
selection and operator execution of the run sheet above.
