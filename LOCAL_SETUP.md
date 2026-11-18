# Local setup and acceptance checks

## First start

1. Install Node.js 22.12+ (Node 24 LTS recommended).
2. Run `npm install` in the `web` branch.
3. Run `npm run admin:create`; choose your username and a password of at least 12 characters. No credential is bundled in the app.
4. Run `npm run dev` to start Vite on port 3000 and the API on port 3001.
5. Open http://localhost:3000. Use http://localhost:3000/admin to sign in as admin.

For noninteractive setup, the admin-create script accepts `NAUTICA_ADMIN_USER` and `NAUTICA_ADMIN_PASSWORD` from your environment or private `.env` file. Never commit the password. Changing the account with `admin:create` invalidates existing sessions. Passwords are salted and hashed using scrypt. Sessions expire after eight hours; logout revokes the server record. Five failed attempts per server-observed IP temporarily block login for 15 minutes.

## Test booking

- Select a boat, date and time. Choose one unbooked seat per guest.
- Enter a lead guest name, valid email and phone number.
- Use UPI `alex@okaxis`, or card `4242 4242 4242 4242` with a future expiry and three-digit CVV, or choose a bank.
- Do not enter real payment credentials. Payment is simulated; only a method summary is sent to the backend.
- Confirmation reserves selected seats in SQLite. Other seats remain available. The same seat numbers on a different boat/date/time remain independent.

Base fares remain flat group booking fares. Add-ons and the 5% fee are recalculated on the server; client-supplied totals are ignored. The demonstration currency rate is ₹83/USD. Dates use the device/server calendar context; production destination timezone handling is still needed.

## Confirm blocking across browsers

1. Book seats 01 and 02 on Ganges Dawn for a chosen date/time.
2. Open the same app in another browser or incognito window, connected to the same backend.
3. Choose the identical boat/date/time. Seats 01 and 02 must be grey and disabled, while other seats remain selectable.
4. Open the map before another browser confirms; refresh it or wait 10 seconds. If two users submit the same seats simultaneously, one confirmation succeeds and the other gets a conflict and returns to the refreshed map.
5. Restart the server. The booked seats must remain blocked.

Selections are not temporary holds. The authoritative check happens at final submission. For a network interruption, retry the same checkout details; idempotency prevents the same request from creating a duplicate. If a confirmation cannot be recovered, the administrator can locate it using the passenger/contact details.

## Check the admin panel

Sign in at `/admin`. Search by passenger name, email, phone or booking reference. Filter boat/date/time, open **View details**, and inspect customer contact, boat, seats, extras, totals, demo payment method/status/reference and timestamps. The seat manifest shows every passenger seat for that trip; clicking a booked seat opens its owner's booking.

An unauthenticated visitor must not receive passenger or payment records from `/api/admin/bookings`. Logout clears access; passwords and session tokens are not stored in browser local storage. Passenger email/phone are excluded from public availability and boarding QR payloads. Test bookings remain in the local database until you deliberately remove or archive that database; no cancellation/deletion UI is provided.

## Storage and hosting

The authoritative database is `data/nautica.sqlite`, including its WAL/SHM files when active. Do not delete it to clear browser storage. Stop the server before copying files directly, or use an appropriate SQLite backup process. The database is not encrypted. Keep it private and outside `dist/`.

Legacy browser-only passes remain readable on their original browser origin, but are not automatically trusted as server reservations or included in admin records. Localhost, 127.0.0.1 and different ports use different browser pass caches. New bookings are centralized on the connected server even if the offline browser copy cannot be saved; download the confirmation immediately if storage is blocked.

For a built app, run `npm run build` then `npm start` and open http://localhost:3001. For deployment, use the Node server with a persistent database volume, an HTTPS reverse proxy, `PUBLIC_ORIGIN`, and `NODE_ENV=production`; Secure cookies require HTTPS. Static-only hosting cannot provide shared availability or admin access. A separate database/service design is needed for multiple independent server replicas.

## Verification

`npm test` runs Vitest/jsdom React tests and Node HTTP/SQLite tests. `npm run build` checks the production bundle. Graphical browser layout, actual printing, real QR scanning and OS sharing still require manual checks. Payment integration, verified customer identity/contact details, signed boarding credentials and actual vessel blueprints remain outside this demo.
