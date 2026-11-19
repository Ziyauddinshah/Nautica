# Nautica — React + Vite + Node/SQLite

A boat booking app with customer registration/login, private booking and payment history, numbered seats, shared availability, simulated checkout, Gmail confirmations, and a protected admin dashboard.

## Run locally

Use **Node.js 22.12+** (Node 24 LTS recommended; earlier Node 22 releases may print an experimental SQLite warning). No Android SDK, external database installation, or native database dependency is required.

```sh
git clone --branch web https://github.com/Ziyauddinshah/Nautica.git
cd Nautica
npm install
npm run admin:create
npm run dev
```

`admin:create` asks you to choose an admin username and a password of at least 12 characters. Password input is hidden. There is **no default admin password**. Re-running it for an existing username resets that password and revokes its active sessions.

- Customer app: **http://localhost:3000**
- Customer account/history: **http://localhost:3000/account**
- Admin dashboard: **http://localhost:3000/admin**
- API: localhost port **3001**, proxied through Vite. `npm run dev` starts both processes and requires port 3000 to be free.

## Customer accounts and data access

Customers can register with a name, email, phone and a unique password of at least 12 characters, then sign in before booking. **My account** shows the signed-in profile, paginated booking history, seat/trip details, boarding passes, payment amounts/references/status, and confirmation-email status. Booking status and demo payment status are shown separately.

The backend assigns each new booking to the authenticated user ID. User IDs or email addresses submitted by the browser cannot change ownership. Customer history/detail endpoints filter by that ID on the server; another user's booking ID returns 404. The checkout email is fixed to the signed-in account, including SMTP confirmations. Admin permissions remain separate.

Passwords are salted and hashed using scrypt (N=32768, r=8, p=3). Random session tokens are stored hashed server-side and issued in HttpOnly, SameSite=Strict cookies, with Secure required in production. Sessions expire after eight hours. Login, registration and password-change attempts are throttled; cross-origin writes are rejected. **Account security** allows a password change after checking the current password; this revokes every device session and requires a new login. Logout revokes the current session. Account changes refresh across tabs and on focus.

No customer passwords, session tokens, booking history or payment records are persisted by the new frontend in local storage. Only the currency preference is stored there. Downloaded pass files remain on the user's device by explicit choice.

Existing **guest/unowned bookings are not automatically assigned by matching email**, because registration does not prove ownership of past guest reservations. They remain available to authorized admins. Old browser-only pass copies are ignored by the account UI and are not imported into history; they are left untouched to avoid deleting user files. The signed-in Account security page provides an explicit option to clear old browser pass copies on a shared device.

Forgotten-password recovery is available through a single-use email link as described below. Email verification at registration, MFA, account deletion and contact/profile editing are not implemented. Use HTTPS when deploying and keep database files/backups private; SQLite contact data is not encrypted at rest. This is a tested application implementation, not a claim that every deployment is secure by default.

## Forgot password — no current password required

Choose **Forgot password?** on the customer sign-in form and enter the registered email address. If the account exists and Gmail SMTP/password-reset delivery is configured, an email provides a single-use reset link valid for **15 minutes**. The user sets a new 12+ character password and then signs in again. Successful reset revokes every existing session and every outstanding reset link. Changing a password from Account security also invalidates older reset links.

Reset links require both working Gmail SMTP and a trusted `PUBLIC_ORIGIN` in `.env`:

```dotenv
PUBLIC_ORIGIN=http://localhost:3000
```

For deployment use the actual **HTTPS origin**, e.g. `PUBLIC_ORIGIN=https://nautica.example.com`, and restart the server. The origin must not contain credentials, paths, query strings or fragments. HTTP is accepted only for local development. The app never constructs reset links from an untrusted Host header or a redirect supplied by a requester. The admin panel reports when reset delivery is disabled because origin configuration is missing.

Reset tokens are random 256-bit values stored only as hashes in SQLite. The email link carries the token in a URL fragment, which is not sent in the page request; the frontend removes it from the address bar before React mounts and keeps it only in memory for submission. Reloading the cleaned page requires reopening the email link or requesting another one. Tokens are not placed in browser storage, API responses, application logs, booking QR codes or admin records.

The request form returns the same response for registered and unregistered emails, without waiting for SMTP. Reset requests are throttled (five per observed IP and three per email per 15 minutes); reset submissions are also throttled. Password-reset emails are sent immediately rather than stored with plaintext bearer tokens in the booking email queue. If SMTP fails or the process restarts before delivery, request a new link. No password changes until a valid link is submitted with a new password. There is no default recovery code or fallback that bypasses access to the registered inbox. Admin password recovery continues to use the server-side `admin:create` command.

## Seat blocking

A confirmed booking blocks **only its selected seats**, for the exact boat, date and time slot. Other guests can book remaining seats. Booked seats are visibly disabled. Availability refreshes every 10 seconds and can be refreshed manually; the server always checks it again in a SQLite transaction at confirmation.

A database uniqueness constraint prevents two bookings from owning the same seat. Conflicts return the customer to the updated map. Repeated submissions with the same booking request key return the existing confirmation rather than charging/reserving twice. Selection alone does not hold a seat.

The existing demo base fare remains a **flat group booking fare**, plus extras and a 5% fee. It is not a per-seat fare. Currency conversion remains fixed at ₹83/USD. The UI no longer promises exclusive use of the whole boat.

## Admin view

Admin access uses server-verified credentials and an expiring HttpOnly, SameSite cookie, not a frontend password or local-storage admin flag. Protected endpoints expose:

- Booking reference, status, timestamp, date, slot and guest count.
- Lead passenger name, email and phone number.
- Boat name, type, capacity, pier and selected seat numbers.
- Extras, base fare, add-on amount, port fee and total.
- Payment method, demo status, reference, timestamp and card last four digits when relevant.
- Search by passenger/contact/reference, boat/date/time filters, pagination and a clickable trip seat manifest.

Full PAN, CVV and UPI IDs are not sent to the server or saved. Email and phone are available only in authenticated admin records, not in public availability or boarding QR payloads.

## Persistence

SQLite stores authoritative bookings, occupied seats, customer/admin password hashes and sessions in **data/nautica.sqlite**. Restarting the server preserves them. This directory and `.env` are ignored by Git. Keep the database outside `dist/` and back it up appropriately; it contains passenger contact information.

Signed-in customer history is loaded from the server. Legacy browser copies are no longer displayed in the account app, and unowned reservations are not auto-claimed. New availability, account history and admin views require the same connected backend/database. A backend is required to book; static-only hosting is insufficient.

## Gmail SMTP booking confirmations

Every new confirmed booking queues **two separate emails** in SQLite: one for the customer address entered at checkout and one for the configured administrator. Email includes the booking reference, passenger name, boat/pier, date/time, selected seats, add-ons, price breakdown and demo payment summary. The admin message additionally includes passenger email/phone and an admin-dashboard link when `PUBLIC_ORIGIN` is configured.

1. Copy `.env.example` to a private `.env` file.
2. In your Google account, enable 2-Step Verification and create an **App Password** for this app. Do not use your normal Gmail password or paste the App Password into chat/GitHub.
3. Set these values locally:

```dotenv
SMTP_ENABLED=true
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_USER=youraccount@gmail.com
SMTP_PASS=your_google_app_password
SMTP_ADMIN_TO=admin@example.com
```

`SMTP_USER` is the sender; `SMTP_ADMIN_TO` is the admin notification recipient. They may be the same account. Google Workspace policy may restrict App Password availability; this implementation uses Gmail SMTP with an App Password, not OAuth.

Run `npm run email:verify` to check TLS/authentication without sending any email, then restart `npm run dev` or `npm start`. Port 465 uses TLS; port 587 uses mandatory STARTTLS with certificate verification enabled. SMTP settings are read only by the backend and must never use a `VITE_` prefix.

Email sending is disabled by default. New bookings still queue notifications while disabled, so **enabling SMTP will process pending messages** created after this feature was installed. Pre-existing bookings from before the email feature are not automatically emailed. Booking success does not depend on email success.

The worker retries failed messages up to five times with backoff, keeps separate customer/admin status, and resumes pending work after restart. The admin booking details display statuses and a **Retry failed emails** button once SMTP is configured. That button does not resend already-sent messages. `SMTP accepted` means the SMTP server accepted the message, not proof of inbox delivery; spam filtering, bounces and Gmail quotas may still apply. A process crash after SMTP accepts a message but before SQLite records it can cause a duplicate on recovery; stable Message-IDs help deduplication but do not guarantee exactly-once delivery.

The app sends text and HTML email without attachments. Pass download/PDF sharing remains available in the customer UI. All emails clearly state that payment is simulated and the ticket is a demo.

## Commands

```sh
npm test                  # React/domain tests and real HTTP/SQLite backend tests
npm run build             # Production frontend bundle
npm run email:verify      # Verify Gmail SMTP without sending a message
npm run server            # Backend only (development mode)
npm run preview           # Vite preview; run backend separately
npm start                 # Serve dist/ and API together, default port 3001
```

For a local built-app check, run `npm run build` and `npm start`, then open http://localhost:3001. Both customer and admin screens share that origin.

Optional settings are documented in [.env.example](.env.example). Configure `PUBLIC_ORIGIN` and HTTPS when deploying, use `NODE_ENV=production` for Secure admin cookies, and persist the database on a writable volume. Bind addresses default to localhost. There is no automatic hosting or deployment in this change.

## Scope and validation

Payments remain **simulated**. The `demo_paid` status and `DEMO-` references are not bank/provider confirmations, no money is charged, and tickets are not valid for real travel. Integrate a real provider with verified callbacks before accepting payments. Seat diagrams remain illustrative and require confirmation against actual vessel plans. Contact verification, cancellation/refund flows and multi-instance database hosting are not implemented.

Tests cover seat blocking, conflicts, retries, persistence, server-calculated totals, protected admin access, login/logout, session cookies, login throttling, origin checks, customer validation, React seat states, checkout and admin views. Email tests cover separate recipients, HTML escaping, disabled configuration, retries, retry exhaustion, restart recovery and a real Nodemailer exchange against a local-only test SMTP server. Live Gmail authentication/delivery requires your own configuration and has not been verified in this workspace. Graphical browser, print dialogs and device sharing still require manual acceptance checks.

Source: `src/` (React), `server/` (Node HTTP + SQLite), `scripts/` (startup/admin setup), `tests/` and `server/*.test.js`. The native Android app remains on the separate [`android` branch](https://github.com/Ziyauddinshah/Nautica/tree/android).
