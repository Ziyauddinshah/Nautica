# Local setup and acceptance checks

## First start

1. Install Node.js 22.12+ (Node 24 LTS recommended).
2. Run `npm install` in the `web` branch.
3. Run `npm run admin:create`; choose your username and a password of at least 12 characters. No credential is bundled in the app.
4. Run `npm run dev` to start Vite on port 3000 and the API on port 3001.
5. Open http://localhost:3000. Click **Sign in / Register** to create a customer account. Use `/account` for booking/payment history and `/admin` for admin sign-in.

For noninteractive setup, the admin-create script accepts `NAUTICA_ADMIN_USER` and `NAUTICA_ADMIN_PASSWORD` from your environment or private `.env` file. Never commit the password. Changing the account with `admin:create` invalidates existing sessions. Passwords are salted and hashed using scrypt. Sessions expire after eight hours; logout revokes the server record. Five failed attempts per server-observed IP temporarily block login for 15 minutes.

## Test booking

- Sign in to your customer account, select a boat/date/time, and choose one unbooked seat per guest.
- Check the prefilled lead guest name and phone. The email is fixed to your signed-in account.
- Use UPI `alex@okaxis`, or card `4242 4242 4242 4242` with a future expiry and three-digit CVV, or choose a bank.
- Do not enter real payment credentials. Payment is simulated; only a method summary is sent to the backend.
- Confirmation reserves selected seats in SQLite. Other seats remain available. The same seat numbers on a different boat/date/time remain independent.

Base fares remain flat group booking fares. Add-ons and the 5% fee are recalculated on the server; client-supplied totals are ignored. The demonstration currency rate is ₹83/USD. Dates use the device/server calendar context; production destination timezone handling is still needed.

## Confirm blocking across browsers

1. Book seats 01 and 02 on Ganges Dawn for a chosen date/time.
2. Open the same app in another browser or incognito window, connected to the same backend, and sign in (or register a different test account).
3. Choose the identical boat/date/time. Seats 01 and 02 must be grey and disabled, while other seats remain selectable.
4. Open the map before another browser confirms; refresh it or wait 10 seconds. If two users submit the same seats simultaneously, one confirmation succeeds and the other gets a conflict and returns to the refreshed map.
5. Restart the server. The booked seats must remain blocked.

Selections are not temporary holds. The authoritative check happens at final submission. For a network interruption, retry the same checkout details; idempotency prevents the same request from creating a duplicate. If a confirmation cannot be recovered, the administrator can locate it using the passenger/contact details.

## Check the admin panel

Sign in at `/admin`. Search by passenger name, email, phone or booking reference. Filter boat/date/time, open **View details**, and inspect customer contact, boat, seats, extras, totals, demo payment method/status/reference and timestamps. The seat manifest shows every passenger seat for that trip; clicking a booked seat opens its owner's booking.

An unauthenticated visitor must not receive passenger or payment records from `/api/admin/bookings`. Logout clears access; passwords and session tokens are not stored in browser local storage. Passenger email/phone are excluded from public availability and boarding QR payloads. Test bookings remain in the local database until you deliberately remove or archive that database; no cancellation/deletion UI is provided.

## Storage and hosting

The authoritative database is `data/nautica.sqlite`, including its WAL/SHM files when active. Do not delete it to clear browser storage. Stop the server before copying files directly, or use an appropriate SQLite backup process. The database is not encrypted. Keep it private and outside `dist/`.

Customer history is now server-based and limited to the signed-in owner. Old guest/server bookings remain in admin records but are not auto-assigned to registrations by email. Older browser pass caches are ignored, not deleted automatically. Downloaded files remain on your device; clear legacy browser copies explicitly under Account security when appropriate. New history follows the signed-in account across devices connected to the same backend.

For a built app, run `npm run build` then `npm start` and open http://localhost:3001. For deployment, use the Node server with a persistent database volume, an HTTPS reverse proxy, `PUBLIC_ORIGIN`, and `NODE_ENV=production`; Secure cookies require HTTPS. Static-only hosting cannot provide shared availability or admin access. A separate database/service design is needed for multiple independent server replicas.

## Verification

`npm test` runs Vitest/jsdom React tests and Node HTTP/SQLite tests. `npm run build` checks the production bundle. Graphical browser layout, actual printing, real QR scanning and OS sharing still require manual checks. Payment integration, verified customer identity/contact details, signed boarding credentials and actual vessel blueprints remain outside this demo.


## Gmail email setup and acceptance checks

Copy `.env.example` to `.env` and set `SMTP_ENABLED=true`, `SMTP_USER` to the sender Gmail address, `SMTP_PASS` to a Google App Password, and `SMTP_ADMIN_TO` to the admin recipient. Keep the default `SMTP_HOST=smtp.gmail.com` and `SMTP_PORT=465`, or use port 587 for mandatory STARTTLS. Normal Gmail passwords are not supported by this setup. Never commit `.env` or add SMTP credentials to Vite frontend variables.

1. Run `npm run email:verify`; success verifies connection/authentication only, not inbox delivery.
2. Restart the app server to load the SMTP settings.
3. Make a new booking with an email address you control. Expect a customer confirmation at that address and a separate admin confirmation at `SMTP_ADMIN_TO`.
4. In `/admin`, refresh the booking and check each recipient's email status, attempt count and sent timestamp. Open the message and verify boat, date/time, seats, extras, total and the clear simulated-payment notice.
5. To test failure safely, use invalid SMTP credentials on a local test instance. The booking must still confirm and reserve its seats. Status should become failed with a generic error code; the queue retries with backoff. Fix credentials, restart, and use **Retry failed emails** in admin details if needed.

The queue is part of the same database transaction as the reservation. Repeating an idempotent booking request does not create new email jobs. Two roles are tracked separately even if the admin and customer email happen to be the same address. Customer messages omit admin-only contact summaries and admin links. Full card numbers, CVVs and UPI IDs are never included.

Pending email jobs created after this feature was installed are processed when SMTP becomes configured, including after a restart. Older bookings without queue records show **Not queued (older booking)**. Sent messages cannot be resent with the failed-email retry button. Automatic delivery is at-least-once after process recovery; an SMTP-accepted message may be duplicated if the process stops before recording the success. A stable Message-ID is reused, but recipient providers control deduplication. The single-process worker does not provide bounce webhooks or inbox-delivery tracking.

SMTP error details are reduced to safe codes in the admin panel; secrets and raw provider responses are not logged. Successful `SMTP accepted` status does not guarantee inbox placement. Check spam folders and account sending limits. App Passwords usually require Google 2-Step Verification and may be restricted by your account's administrator. No actual Gmail email was sent during automated tests: SMTP integration tests bind a local test server and use test-only recipients.


## Customer-account acceptance checks

1. Register customer A with a 12+ character password. Sign out and sign back in. Credentials must not appear in browser local storage or API responses.
2. Book seats while signed in, then open `/account`. Check booking reference/status, boat/pier, date/time, seats, payment method/status/amount/reference, email status and downloadable pass.
3. Register customer B in another browser. Its history must not include A's reservations. A request for A's booking ID using B's session must return 404, even if a body/query parameter supplies A's user ID or email.
4. Sign out. History and pass dialogs must disappear. Session-protected endpoints must return 401. Reusing an expired/revoked cookie must fail. On a shared browser, switching accounts must not expose the previous account's in-memory history.
5. In Account security, supply the current password and change to a new unique password. All prior sessions must stop working; the old password must fail and the new one must sign in.
6. Check that registering an email matching a historical guest reservation does not claim that reservation. Legacy claims need a separate verified recovery process, which is not implemented here.

Customer and admin credentials use different tables/cookies. Customer sessions cannot access admin endpoints and admin sessions do not impersonate customers. New bookings require customer login and store the authenticated owner in a database column with a foreign key. Customer contact/payment data stays on the backend and in temporary authenticated UI state; only an explicit file download produces an offline copy. Old browser caches from earlier versions may still exist until the user explicitly clears them, and are never treated as ownership evidence.

Sessions are eight hours with HttpOnly, SameSite=Strict cookies; use HTTPS with `NODE_ENV=production` for Secure cookies. Login/registration/password changes have per-IP and per-account throttling; reverse-proxy deployments currently use the server-observed connection IP. Passwords use salted scrypt; database contact details are not encrypted at rest. Email verification at registration, MFA, account deletion and profile editing are separate future features. No automatic guest-email matching, default customer password or browser-local admin/user role flag is used.


## Forgotten-password recovery

1. Keep Gmail SMTP enabled and configured. Set `PUBLIC_ORIGIN=http://localhost:3000` for local Vite development, or your HTTPS production origin for deployment. When using `npm start` directly on port 3001, use `http://localhost:3001` locally. Restart the server after changing `.env`.
2. On sign-in, select **Forgot password?**, enter your registered email and submit. Existing and nonexistent accounts must receive the same browser response. Only the registered inbox receives a link, if delivery is configured.
3. Follow the email link within 15 minutes. Confirm that the `#token=...` fragment disappears from the address bar when the page loads. Enter a new unique 12+ character password twice. The current password is not needed.
4. Sign in with the new password. The old password and every previously issued session must fail. Reusing the reset link must fail; requesting a second link before resetting does not invalidate the first, but successfully using either invalidates all outstanding links.
5. Test an expired or modified token: the app must show an invalid/expired message and offer a fresh request. No password or session changes should occur. Changing a password through Account security must invalidate older reset links as well.

Reset delivery uses the same Gmail SMTP transport but does not persist email bodies containing bearer tokens. Token hashes and expiry/used state persist in SQLite. If delivery fails or the server stops before sending, request another link; the password is unchanged until a reset succeeds. Request limits apply even to nonexistent addresses. The raw token never appears in server responses or stored booking metadata. Do not log request bodies or share/reset links. For local development, origin/port must match the app you want the email to open. Production reset links require HTTPS. Live Gmail delivery still needs your configured account credentials and has not been verified with a real Gmail account in automated tests.
