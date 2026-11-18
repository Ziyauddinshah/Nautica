# Nautica — React + Vite + Node/SQLite

A boat booking app with numbered seats, shared server availability, simulated checkout, saved boarding passes, and a protected admin dashboard.

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
- Admin dashboard: **http://localhost:3000/admin**
- API: localhost port **3001**, proxied through Vite. `npm run dev` starts both processes and requires port 3000 to be free.

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

SQLite stores authoritative bookings, occupied seats, admin password hashes and sessions in **data/nautica.sqlite**. Restarting the server preserves them. This directory and `.env` are ignored by Git. Keep the database outside `dist/` and back it up appropriately; it contains passenger contact information.

Each browser keeps an additional offline pass copy using the previous app's storage keys. Legacy local-only passes still open, but they are **not imported into server inventory or admin records**. New availability and admin views work only when browsers connect to the same backend/database. A backend is required to book; static-only hosting is no longer sufficient.

## Commands

```sh
npm test                  # React/domain tests and real HTTP/SQLite backend tests
npm run build             # Production frontend bundle
npm run server            # Backend only (development mode)
npm run preview           # Vite preview; run backend separately
npm start                 # Serve dist/ and API together, default port 3001
```

For a local built-app check, run `npm run build` and `npm start`, then open http://localhost:3001. Both customer and admin screens share that origin.

Optional settings are documented in [.env.example](.env.example). Configure `PUBLIC_ORIGIN` and HTTPS when deploying, use `NODE_ENV=production` for Secure admin cookies, and persist the database on a writable volume. Bind addresses default to localhost. There is no automatic hosting or deployment in this change.

## Scope and validation

Payments remain **simulated**. The `demo_paid` status and `DEMO-` references are not bank/provider confirmations, no money is charged, and tickets are not valid for real travel. Integrate a real provider with verified callbacks before accepting payments. Seat diagrams remain illustrative and require confirmation against actual vessel plans. Customer accounts, contact verification, cancellation/refund flows and multi-instance database hosting are not implemented.

Tests cover seat blocking, conflicts, retries, persistence, server-calculated totals, protected admin access, login/logout, session cookies, login throttling, origin checks, customer validation, React seat states, checkout and admin views. Graphical browser, print dialogs and device sharing still require manual acceptance checks.

Source: `src/` (React), `server/` (Node HTTP + SQLite), `scripts/` (startup/admin setup), `tests/` and `server/*.test.js`. The native Android app remains on the separate [`android` branch](https://github.com/Ziyauddinshah/Nautica/tree/android).
