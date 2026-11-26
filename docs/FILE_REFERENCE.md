<!-- prettier-ignore-start -->
# Repository file reference

Generated with `npm run docs:generate`. Start with [the developer guide](DEVELOPER_GUIDE.md).
Purpose comments describe modules; feature guides explain business rules and security limits.

## Root

| File | Purpose |
| --- | --- |
| [.dockerignore](../.dockerignore) | Files excluded from container build contexts. |
| [.env.example](../.env.example) | Placeholder server environment settings; copy privately, never commit populated secrets. |
| [.gitignore](../.gitignore) | Files Git must exclude, including local data, keys and private backups. |
| [.prettierignore](../.prettierignore) | Generated and private files excluded from formatting. |
| [.prettierrc.json](../.prettierrc.json) | Shared code layout rules. |
| [ADMIN_SECURITY_OPERATIONS.md](../ADMIN_SECURITY_OPERATIONS.md) | Admin two-factor authentication and operational alerts. |
| [AFTERCARE.md](../AFTERCARE.md) | Cancellation, refunds and document-expiry reminders. |
| [ARCHITECTURE.md](../ARCHITECTURE.md) | Architecture and extension points. |
| [BACKUP_RESTORE_PILOT.md](../BACKUP_RESTORE_PILOT.md) | Backup restoration and small launch pilot. |
| [CHECKOUT_EXPERIENCE.md](../CHECKOUT_EXPERIENCE.md) | Seat selection, mobile checkout and payment recovery. |
| [COMMERCIAL_LAUNCH.md](../COMMERCIAL_LAUNCH.md) | Multi-server commercial launch. |
| [CONTRIBUTING.md](../CONTRIBUTING.md) | Working on Nautica. |
| [Dockerfile](../Dockerfile) | Production application image build; no production secrets belong in image layers. |
| [FLEET_REGISTRATION.md](../FLEET_REGISTRATION.md) | Boat registration — India / Varanasi. |
| [LOCAL_SETUP.md](../LOCAL_SETUP.md) | Local testing. |
| [OWNER_VERIFICATION.md](../OWNER_VERIFICATION.md) | Boat-owner identity and mobile verification. |
| [README.md](../README.md) | Nautica — React, Node and shared MongoDB. |
| [SECURITY.md](../SECURITY.md) | Security reporting and maintenance. |
| [SHARED_DATA.md](../SHARED_DATA.md) | Shared online data and SQLite migration. |
| [compose.yaml](../compose.yaml) | Application replicas and ingress deployment wiring. |
| [index.html](../index.html) | Browser HTML entry loaded by Vite. |
| [package-lock.json](../package-lock.json) | Generated dependency versions and integrity hashes; update through npm. |
| [package.json](../package.json) | Runtime dependencies, development tools and npm commands. |
| [vite.config.js](../vite.config.js) | Build/test configuration and development restrictions on private file access. |

## .github

| File | Purpose |
| --- | --- |
| [.github/PULL_REQUEST_TEMPLATE.md](../.github/PULL_REQUEST_TEMPLATE.md) | Project documentation.. |
| [.github/workflows/quality.yml](../.github/workflows/quality.yml) | Repository automation; checks run against synthetic data without production secrets. |

## deploy

| File | Purpose |
| --- | --- |
| [deploy/Caddyfile](../deploy/Caddyfile) | Ingress/deployment configuration; review trusted proxy and network boundaries before production. |

## docs

| File | Purpose |
| --- | --- |
| [docs/ACCESS_PRIVACY_SECURITY.md](../docs/ACCESS_PRIVACY_SECURITY.md) | Third-party access, privacy and security controls. |
| [docs/API_GUIDE.md](../docs/API_GUIDE.md) | API orientation for authorized integrations. |
| [docs/DEVELOPER_GUIDE.md](../docs/DEVELOPER_GUIDE.md) | Developer onboarding and code navigation. |
| [docs/FILE_REFERENCE.md](../docs/FILE_REFERENCE.md) | Generated file-by-file navigation index; regenerate with npm run docs:generate. |

## integration

| File | Purpose |
| --- | --- |
| [integration/mongodb.test.js](../integration/mongodb.test.js) | Regression tests for mongodb behavior using isolated fixtures. |
| [integration/recovery.test.js](../integration/recovery.test.js) | Regression tests for recovery behavior using isolated fixtures. |

## scripts

| File | Purpose |
| --- | --- |
| [scripts/admin-create.js](../scripts/admin-create.js) | Trusted operator CLI to create/update an individual admin without printing its password. |
| [scripts/admin-mfa-reset.js](../scripts/admin-mfa-reset.js) | Trusted interactive console recovery that revokes sessions and authorizes MFA re-enrollment. |
| [scripts/aftercare-run.js](../scripts/aftercare-run.js) | Runs shared refund reconciliation and document reminder jobs as an operator command. |
| [scripts/backfill-payments.js](../scripts/backfill-payments.js) | Repeatable historical payment-record backfill for existing bookings. |
| [scripts/backup.js](../scripts/backup.js) | Legacy read-only-source SQLite backup CLI; does not back up MongoDB. |
| [scripts/check-boundaries.js](../scripts/check-boundaries.js) | Checks tracked private artifacts and the browser/server code boundary. This is not a full secret scanner. |
| [scripts/db-connect.js](../scripts/db-connect.js) | Read-only MongoDB connectivity and authentication diagnostics with sanitized output. |
| [scripts/db-init.js](../scripts/db-init.js) | Initializes a deliberately new MongoDB database; never a production repair shortcut. |
| [scripts/db-restore.js](../scripts/db-restore.js) | Legacy SQLite restoration to a new private path without overwriting existing data. |
| [scripts/db-status.js](../scripts/db-status.js) | Reports shared database readiness and record counts without customer payloads. |
| [scripts/dev.js](../scripts/dev.js) | Starts development API and frontend processes with local-only defaults. |
| [scripts/email-verify.js](../scripts/email-verify.js) | Operator SMTP connectivity verification; keep server credentials private. |
| [scripts/file-reference.js](../scripts/file-reference.js) | Generates or checks the repository file index from tracked and unignored source files. |
| [scripts/migrate-sqlite.js](../scripts/migrate-sqlite.js) | Imports a consistent read-only SQLite backup into a new MongoDB namespace. |
| [scripts/mongo-backup.js](../scripts/mongo-backup.js) | Creates a new private encrypted snapshot of the configured small MongoDB database. |
| [scripts/mongo-local.js](../scripts/mongo-local.js) | Starts a persistent loopback MongoDB replica set for local development. |
| [scripts/mongo-restore-test.js](../scripts/mongo-restore-test.js) | Restores an encrypted archive into a disposable local replica set without starting workers. |
| [scripts/pilot-simulate.js](../scripts/pilot-simulate.js) | Runs the synthetic pilot checks and writes a private result report without live providers. |
| [scripts/production-check.js](../scripts/production-check.js) | Operator readiness/configuration checks; not legal approval or provider-delivery proof. |
| [scripts/share.js](../scripts/share.js) | Serves a built development app on a trusted LAN; not a production HTTPS deployment. |
| [scripts/sms-verify.js](../scripts/sms-verify.js) | Operator TextBee configuration verification against the intended provider environment. |

## server

| File | Purpose |
| --- | --- |
| [server/aftercare.test.js](../server/aftercare.test.js) | Regression tests for aftercare behavior using isolated fixtures. |
| [server/aftercare/cancellations.js](../server/aftercare/cancellations.js) | Cancellation eligibility, requests, approvals and atomic seat release. |
| [server/aftercare/notices.js](../server/aftercare/notices.js) | Sanitized customer/admin notifications for aftercare events. |
| [server/aftercare/policy.js](../server/aftercare/policy.js) | Cancellation cutoff policy and departure-time calculations. |
| [server/aftercare/refunds.js](../server/aftercare/refunds.js) | Admin-approved refund issuance, durable reconciliation and financial audit events. |
| [server/aftercare/reminders.js](../server/aftercare/reminders.js) | Document expiry reminder milestones and version-aware duplicate suppression. |
| [server/aftercare/worker.js](../server/aftercare/worker.js) | Background coordination for cancellation, refund and document reminder jobs, with bounded work and graceful stopping. |
| [server/app.js](../server/app.js) | HTTP routing, request validation, session authorization and safe responses. |
| [server/app.test.js](../server/app.test.js) | Regression tests for app behavior using isolated fixtures. |
| [server/config.js](../server/config.js) | Validates runtime and production settings before the server starts. |
| [server/contributor-safety.test.js](../server/contributor-safety.test.js) | Regression tests for contributor-safety behavior using isolated fixtures. |
| [server/database-path.js](../server/database-path.js) | Resolves legacy SQLite test/migration paths and protects public directories. |
| [server/devPrivacy.test.js](../server/devPrivacy.test.js) | Regression tests for dev privacy behavior using isolated fixtures. |
| [server/domain/accounts.js](../server/domain/accounts.js) | Account validation, password verification and public account projections. |
| [server/domain/booking.js](../server/domain/booking.js) | Trip, boat, seat and price rules shared by this layer. |
| [server/domain/history.js](../server/domain/history.js) | Booking/payment history filters and journey dates for authorized account views. |
| [server/domain/payment-record.js](../server/domain/payment-record.js) | Pure validation and public data rules for payment record. |
| [server/domain/refund-view.js](../server/domain/refund-view.js) | Pure validation and public data rules for refund view. |
| [server/domain/signature.js](../server/domain/signature.js) | Pure validation and public data rules for signature. |
| [server/domain/sms.js](../server/domain/sms.js) | Pure validation and public data rules for sms. |
| [server/email.js](../server/email.js) | Email settings, notice rendering and legacy notification test support. |
| [server/email.test.js](../server/email.test.js) | Regression tests for email behavior using isolated fixtures. |
| [server/errors.js](../server/errors.js) | Shared API errors and one-way token digests. |
| [server/fleet.test.js](../server/fleet.test.js) | Regression tests for fleet behavior using isolated fixtures. |
| [server/fleet/domain.js](../server/fleet/domain.js) | Pure validation and business rules for boat ownership, private document and approval workflows. |
| [server/fleet/http.js](../server/fleet/http.js) | Authenticated HTTP endpoints and request validation for boat ownership, private document and approval workflows. |
| [server/fleet/repository.js](../server/fleet/repository.js) | Persistence, authorization and transactional state changes for boat ownership, private document and approval workflows. |
| [server/fleet/scanner.js](../server/fleet/scanner.js) | Private malware scanner integration for uploaded boat documents. |
| [server/history.test.js](../server/history.test.js) | Regression tests for history behavior using isolated fixtures. |
| [server/index.js](../server/index.js) | Server composition root: configures storage, providers, workers and graceful shutdown. |
| [server/mongo-config.js](../server/mongo-config.js) | Validates private MongoDB connection settings and production consistency requirements. |
| [server/mongo-config.test.js](../server/mongo-config.test.js) | Regression tests for mongo-config behavior using isolated fixtures. |
| [server/mongo-diagnostics.js](../server/mongo-diagnostics.js) | Maps database failures to safe diagnostic categories without connection secrets. |
| [server/mongo-diagnostics.test.js](../server/mongo-diagnostics.test.js) | Regression tests for mongo-diagnostics behavior using isolated fixtures. |
| [server/operations/catalog.js](../server/operations/catalog.js) | Feature message/condition catalog; no private provider settings are exposed. |
| [server/operations/repository.js](../server/operations/repository.js) | Persistence, authorization and transactional state changes for operational incident and delivery workflows. |
| [server/operations/webhook.js](../server/operations/webhook.js) | HTTPS operational webhook transport with safe payloads and stable event identity. |
| [server/operations/worker.js](../server/operations/worker.js) | Background coordination for operational incident and delivery jobs, with bounded work and graceful stopping. |
| [server/passwordReset.test.js](../server/passwordReset.test.js) | Regression tests for password reset behavior using isolated fixtures. |
| [server/payment-record.test.js](../server/payment-record.test.js) | Regression tests for payment-record behavior using isolated fixtures. |
| [server/payments.js](../server/payments.js) | Legacy SQLite payment adapter for isolated regression tests. |
| [server/payments.test.js](../server/payments.test.js) | Regression tests for payments behavior using isolated fixtures. |
| [server/persistence.test.js](../server/persistence.test.js) | Regression tests for persistence behavior using isolated fixtures. |
| [server/privacy.test.js](../server/privacy.test.js) | Regression tests for privacy behavior using isolated fixtures. |
| [server/recovery/snapshot.js](../server/recovery/snapshot.js) | Bounded encrypted MongoDB snapshots and exact BSON/index restoration verification. |
| [server/repositories/mongo-connection.js](../server/repositories/mongo-connection.js) | Opens MongoDB and creates required collections and indexes with majority guarantees. |
| [server/repositories/mongo-outbox.js](../server/repositories/mongo-outbox.js) | Durable email jobs with fenced claims and bounded retries across replicas. |
| [server/repositories/mongo-payments.js](../server/repositories/mongo-payments.js) | Transactional payment attempts, held seats and provider-confirmed booking persistence. |
| [server/repositories/mongo-sms.js](../server/repositories/mongo-sms.js) | Durable SMS jobs and provider acceptance reconciliation without blind resending. |
| [server/repositories/mongo.js](../server/repositories/mongo.js) | Shared MongoDB repository for sessions, bookings, inventory and transaction coordination. |
| [server/repositories/payment-records.js](../server/repositories/payment-records.js) | Stores linked booking payment records and supports historical backfill. |
| [server/repositories/sqlite.js](../server/repositories/sqlite.js) | Legacy SQLite adapter for migration and regression only; no production fallback. |
| [server/runtime.js](../server/runtime.js) | Opens the required MongoDB repository with no offline storage fallback. |
| [server/security.test.js](../server/security.test.js) | Regression tests for security behavior using isolated fixtures. |
| [server/security/admin-mfa.js](../server/security/admin-mfa.js) | Admin password challenges, encrypted TOTP enrollment, recovery codes and trusted reset. |
| [server/security/totp.js](../server/security/totp.js) | RFC-compatible TOTP verification and account-bound AES-GCM seed encryption. |
| [server/services/email.js](../server/services/email.js) | Fenced shared email delivery with injected SMTP transport and bounded retries. |
| [server/services/payments.js](../server/services/payments.js) | Provider-neutral checkout and capture coordination outside retryable database transactions. |
| [server/services/razorpay.js](../server/services/razorpay.js) | Razorpay gateway adapter: signatures, authoritative evidence and sanitized provider health. |
| [server/services/sms.js](../server/services/sms.js) | Shared SMS send/poll coordination that distinguishes failure from unknown acceptance. |
| [server/services/textbee.js](../server/services/textbee.js) | Private TextBee transport and sanitized SMS provider health observations. |
| [server/sms.test.js](../server/sms.test.js) | Regression tests for sms behavior using isolated fixtures. |
| [server/store.js](../server/store.js) | Legacy SQLite booking and admin fixture; not the production database runtime. |
| [server/users.js](../server/users.js) | Legacy SQLite customer/authentication fixture used by regression and migration tests. |
| [server/users.test.js](../server/users.test.js) | Regression tests for users behavior using isolated fixtures. |
| [server/verification.test.js](../server/verification.test.js) | Regression tests for verification behavior using isolated fixtures. |
| [server/verification/http.js](../server/verification/http.js) | Authenticated HTTP endpoints and request validation for owner identity and mobile verification workflows. |
| [server/verification/provider.js](../server/verification/provider.js) | Server-only authorized identity bridge integration and signed evidence validation. |
| [server/verification/repository.js](../server/verification/repository.js) | Persistence, authorization and transactional state changes for owner identity and mobile verification workflows. |
| [server/views.js](../server/views.js) | Builds allowlisted API responses so private persistence fields stay server-side. |

## src

| File | Purpose |
| --- | --- |
| [src/App.jsx](../src/App.jsx) | Coordinates public booking screens, route selection and application UI state. |
| [src/components/AdminDashboard.jsx](../src/components/AdminDashboard.jsx) | React admin dashboard view; authorization and authoritative state remain on the server. |
| [src/components/AdminSecurity.jsx](../src/components/AdminSecurity.jsx) | React admin security view; authorization and authoritative state remain on the server. |
| [src/components/AdminSignIn.jsx](../src/components/AdminSignIn.jsx) | React admin sign in view; authorization and authoritative state remain on the server. |
| [src/components/AuthForm.jsx](../src/components/AuthForm.jsx) | React auth form view; authorization and authoritative state remain on the server. |
| [src/components/BoardingPass.jsx](../src/components/BoardingPass.jsx) | React boarding pass view; authorization and authoritative state remain on the server. |
| [src/components/BoatArt.jsx](../src/components/BoatArt.jsx) | React boat art view; authorization and authoritative state remain on the server. |
| [src/components/BookingDialog.jsx](../src/components/BookingDialog.jsx) | React booking dialog view; authorization and authoritative state remain on the server. |
| [src/components/CancellationControls.jsx](../src/components/CancellationControls.jsx) | React cancellation controls view; authorization and authoritative state remain on the server. |
| [src/components/CustomerAccount.jsx](../src/components/CustomerAccount.jsx) | React customer account view; authorization and authoritative state remain on the server. |
| [src/components/DocumentReminders.jsx](../src/components/DocumentReminders.jsx) | React document reminders view; authorization and authoritative state remain on the server. |
| [src/components/DocumentRenewals.jsx](../src/components/DocumentRenewals.jsx) | React document renewals view; authorization and authoritative state remain on the server. |
| [src/components/FleetPortal.jsx](../src/components/FleetPortal.jsx) | React fleet portal view; authorization and authoritative state remain on the server. |
| [src/components/HoldCountdown.jsx](../src/components/HoldCountdown.jsx) | Accessible countdown based on server hold duration; expiry never proves payment failure. |
| [src/components/OperationsDashboard.jsx](../src/components/OperationsDashboard.jsx) | React operations dashboard view; authorization and authoritative state remain on the server. |
| [src/components/OwnerVerification.jsx](../src/components/OwnerVerification.jsx) | React owner verification view; authorization and authoritative state remain on the server. |
| [src/components/PaymentForm.jsx](../src/components/PaymentForm.jsx) | React payment form view; authorization and authoritative state remain on the server. |
| [src/components/PaymentRecovery.jsx](../src/components/PaymentRecovery.jsx) | Read-only payment recovery: checks the owned attempt without creating another charge. |
| [src/components/QrCode.jsx](../src/components/QrCode.jsx) | React qr code view; authorization and authoritative state remain on the server. |
| [src/components/RefundAdministration.jsx](../src/components/RefundAdministration.jsx) | React refund administration view; authorization and authoritative state remain on the server. |
| [src/components/ResetPassword.jsx](../src/components/ResetPassword.jsx) | React reset password view; authorization and authoritative state remain on the server. |
| [src/components/SeatMap.jsx](../src/components/SeatMap.jsx) | React seat map view; authorization and authoritative state remain on the server. |
| [src/components/TripSummary.jsx](../src/components/TripSummary.jsx) | React trip summary view; authorization and authoritative state remain on the server. |
| [src/domain/boardingPass.js](../src/domain/boardingPass.js) | Public UI constants and presentation rules for boardingPass. |
| [src/domain/booking.js](../src/domain/booking.js) | Trip, boat, seat and price rules shared by this layer. |
| [src/domain/fleet.js](../src/domain/fleet.js) | Boat registration fields, document requirements and review checklist. |
| [src/domain/operations.js](../src/domain/operations.js) | Public UI constants and presentation rules for operations. |
| [src/hooks/useBackgroundRefresh.js](../src/hooks/useBackgroundRefresh.js) | Refreshes visible data periodically and on browser focus/reconnect. |
| [src/hooks/useCustomerSession.js](../src/hooks/useCustomerSession.js) | Loads the customer session and clears legacy personal-data caches. |
| [src/i18n/I18nProvider.jsx](../src/i18n/I18nProvider.jsx) | Provides English/Hindi language state and translated UI text. |
| [src/i18n/catalog.js](../src/i18n/catalog.js) | Feature message/condition catalog; no private provider settings are exposed. |
| [src/lib/api.js](../src/lib/api.js) | Same-origin browser API client with safe response handling and language selection. |
| [src/lib/passExport.js](../src/lib/passExport.js) | Browser helper for pass export; keep private server settings out of this module. |
| [src/lib/qr.js](../src/lib/qr.js) | Browser helper for qr; keep private server settings out of this module. |
| [src/lib/razorpay.js](../src/lib/razorpay.js) | Browser hosted checkout; capture evidence and all merchant secrets remain on the server. |
| [src/lib/refundStatus.js](../src/lib/refundStatus.js) | Browser helper for refund status; keep private server settings out of this module. |
| [src/lib/resetLink.js](../src/lib/resetLink.js) | Browser helper for reset link; keep private server settings out of this module. |
| [src/lib/smsStatus.js](../src/lib/smsStatus.js) | Browser helper for sms status; keep private server settings out of this module. |
| [src/lib/storage.js](../src/lib/storage.js) | Reads only safe legacy browser preferences; customer records belong on the server. |
| [src/main.jsx](../src/main.jsx) | Browser entry: mounts the React application and providers. |
| [src/styles.css](../src/styles.css) | Application layout, typography, responsive behavior and accessible visual states. |

## tests

| File | Purpose |
| --- | --- |
| [tests/AdminDashboard.test.jsx](../tests/AdminDashboard.test.jsx) | Regression tests for admin dashboard behavior using isolated fixtures. |
| [tests/App.test.jsx](../tests/App.test.jsx) | Regression tests for app behavior using isolated fixtures. |
| [tests/adminSecurity.test.jsx](../tests/adminSecurity.test.jsx) | Regression tests for admin security behavior using isolated fixtures. |
| [tests/aftercare.test.jsx](../tests/aftercare.test.jsx) | Regression tests for aftercare behavior using isolated fixtures. |
| [tests/apiMock.js](../tests/apiMock.js) | Browser test apiMock support using synthetic data and fake API responses. |
| [tests/availability.test.jsx](../tests/availability.test.jsx) | Regression tests for availability behavior using isolated fixtures. |
| [tests/booking.test.js](../tests/booking.test.js) | Regression tests for booking behavior using isolated fixtures. |
| [tests/checkoutExperience.test.jsx](../tests/checkoutExperience.test.jsx) | Checkout usability tests cover held seats, server-clock countdown and read-only recovery. |
| [tests/customerAccount.test.jsx](../tests/customerAccount.test.jsx) | Regression tests for customer account behavior using isolated fixtures. |
| [tests/fleet.test.jsx](../tests/fleet.test.jsx) | Regression tests for fleet behavior using isolated fixtures. |
| [tests/hostedCheckout.test.jsx](../tests/hostedCheckout.test.jsx) | Hosted checkout dismissal recovers a server-confirmed booking without a second order. |
| [tests/i18n.test.jsx](../tests/i18n.test.jsx) | Regression tests for i18n behavior using isolated fixtures. |
| [tests/journeyHistory.test.jsx](../tests/journeyHistory.test.jsx) | Regression tests for journey history behavior using isolated fixtures. |
| [tests/ownerVerification.test.jsx](../tests/ownerVerification.test.jsx) | Regression tests for owner verification behavior using isolated fixtures. |
| [tests/passwordReset.test.jsx](../tests/passwordReset.test.jsx) | Regression tests for password reset behavior using isolated fixtures. |
| [tests/privacy.test.jsx](../tests/privacy.test.jsx) | Regression tests for privacy behavior using isolated fixtures. |
| [tests/setup.js](../tests/setup.js) | Browser test setup support using synthetic data and fake API responses. |
| [tests/sms.test.jsx](../tests/sms.test.jsx) | Regression tests for sms behavior using isolated fixtures. |
| [tests/storage.test.js](../tests/storage.test.js) | Regression tests for storage behavior using isolated fixtures. |
| [tests/synchronization.test.jsx](../tests/synchronization.test.jsx) | Regression tests for synchronization behavior using isolated fixtures. |

<!-- prettier-ignore-end -->
