# Nautica commercial launch

The web branch includes Hindi/English UI, SMTP confirmations, customer accounts,
seat reservations and hosted Razorpay Checkout. It is a tested application
foundation, not an already deployed or approved commercial booking service.
Hosting/domain are undecided. Merchant credentials have not been supplied and no
live charge, live email or provider webhook has been tested in this workspace.

## Local development

Use Node 24, `npm ci`, copy `.env.example` to `.env`, then `npm run dev`.
Local `PAYMENT_MODE=demo` does not charge money. No Android SDK is needed.
Select English or हिन्दी in the header; the preference is saved on that browser.
Booking and reset emails use the language selected when requested. Boat IDs,
seat IDs, dates, names, contact details and payment references stay unchanged.

For gateway testing, use `PAYMENT_MODE=razorpay` with Razorpay **test** keys,
a test webhook secret and a controlled HTTPS webhook endpoint. Do not enter live
payment credentials into a demo checkout. Razorpay mode uses the provider's
hosted checkout; Nautica does not collect card numbers, CVV or UPI credentials.
All orders and captured amounts are INR. USD is only an indicative display at a
fixed ₹83/USD rate; this is not a live exchange rate or a USD charge.

## Required before taking real bookings

- Replace the sample fleet, illustrative seat layouts, reviews and international
  destinations in `src/domain/booking.js` with boats you actually operate. Verify
  capacities, captain arrangements, safety equipment, departure time zones,
  schedules, prices and all displayed marketing claims. The current date/slot
  model has no operator cancellation, weather or rescheduling workflow.
- Supply the legal business identity, support contact, privacy notice, retention
  and deletion procedure, terms, cancellation/refund rules and any required
  consent. Have qualified advisers review local boating permissions, insurance,
  taxes/GST and invoicing obligations. The current 5% port fee is not a tax invoice.
- Choose a domain and hosting with a persistent private disk. This SQLite design
  supports a **single application instance**; do not run independent replicas or
  deploy onto ephemeral/serverless filesystems. Plan a shared transactional
  database before scaling horizontally.
- Activate a Razorpay merchant account, configure automatic capture, set live keys
  and a separate strong webhook secret. Subscribe to `payment.captured` and
  `order.paid` at `https://YOUR_DOMAIN/api/payments/razorpay/webhook`. Exercise a
  controlled live payment, signature verification, callback loss, webhook retry,
  refund and settlement reconciliation before opening sales.
- Configure Gmail SMTP with an App Password and the admin recipient. Run
  `npm run email:verify` and test customer/admin confirmations and password-reset
  delivery in both languages. Plan SMTP sending limits and delivery monitoring.
- Set `NODE_ENV=production`, `PUBLIC_ORIGIN=https://YOUR_DOMAIN`,
  `PAYMENT_MODE=razorpay`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`,
  `RAZORPAY_WEBHOOK_SECRET`. Run `npm run production:check`. This checks settings,
  not your merchant approval, actual delivery or business readiness. Production
  refuses demo payments and test keys; `PAYMENT_MODE=disabled` permits browsing
  without accepting bookings.
- Create an individual admin with `npm run admin:create`; use a unique password,
  restrict admin access at the HTTPS proxy/VPN and establish an account recovery
  process. Customer email verification and admin MFA are not implemented.
- Run `npm test` and `npm run build`, review dependencies and perform independent
  security/accessibility and operational acceptance reviews for your deployment.

## HTTPS deployment

`npm ci && npm run build && npm start` serves both frontend and API on port 3001.
Place it behind a TLS reverse proxy, forwarding the API and static routes to the
same origin. Keep port 3001 private. Set PUBLIC_ORIGIN to the exact HTTPS origin;
production writes reject other origins. Cookies are HttpOnly, SameSite=Strict
and Secure. SMTP credentials, gateway secrets and database files must remain
server-side and outside `dist`. Never prefix secrets with `VITE_`.

A non-root Node 24 Dockerfile is included. Build with `docker build -t nautica .`.
Provide environment variables at runtime, mount `/app/data` on a private persistent
volume writable by UID 1000, and place HTTPS in front of the container. Never copy
`.env` into an image. Set PUBLIC_ORIGIN before startup; the default production
payment mode is disabled. The Docker build was attempted here but npm inside the build rejected this
workspace’s TLS certificate chain (`SELF_SIGNED_CERT_IN_CHAIN`). TLS verification
was kept enabled. Validate the image on your chosen host or configure your
organization’s trusted build CA; no completed container image is claimed.

If the proxy connects from a known address, set `TRUSTED_PROXY_IPS` to that exact
socket IP (comma separated if needed). The app uses the rightmost forwarded IP
only for explicitly trusted peers; the proxy must overwrite or append the actual
client address. Forwarded IPs from other peers are ignored. Rate limits are in
process and reset on restart. Use edge rate limits/WAF for internet traffic;
without trusted proxy configuration users behind the proxy share rate limits.

## Payments, holds and refunds

Only selected seats are held for 15 minutes during checkout. Other guests can
book remaining seats. The server calculates amounts and verifies callback HMAC,
then fetches the payment from Razorpay to require captured INR funds for that
order and amount. Webhooks are verified against the raw body with a separate
secret. Duplicate notifications reuse the existing booking and email jobs.
A network timeout during order creation is retained as an uncertain attempt;
it must not generate another remote order under the same request key.

If capture arrives after the hold expires, confirmation succeeds only if those
seats are still free and the trip date is valid. Otherwise the attempt becomes
`refund_required`, appears in the admin dashboard and in the customer's payment
history, and does not issue a boarding pass. **Refunds are manual in Razorpay
Dashboard.** Establish staff alerts and a reconciliation schedule; the app does
not automatically refund, mark refunded attempts resolved or email failed-booking
refund instructions. Retain the Razorpay payment reference for reconciliation.
Authorized but uncaptured payments remain pending; investigate in the provider
Dashboard. Check history before retrying to avoid paying twice. Do not launch
unless staff can service these cases and publish the applicable refund policy.

## Backup, restore and monitoring

Use `npm run db:backup -- /PRIVATE_PATH/nautica-YYYY-MM-DD.sqlite` for a consistent
SQLite online backup. The destination must be new and outside the public folder.
Encrypt backups, restrict access, copy them off the host, choose retention and
test restoration. Do not copy a live SQLite file while ignoring its WAL.

To restore, stop the application, preserve the current database and its WAL/SHM
as an incident copy, restore a verified backup to NAUTICA_DB with permissions
0600 and ownership matching the application user, remove old WAL/SHM only while
the application is stopped, then restart. Check account access, seat occupancy,
email queue and Razorpay transactions since the backup before reopening sales.
Never commit databases or backups. They contain personal information.

Monitor `/api/health`, TLS expiry, disk space, process restarts, failed SMTP jobs,
Razorpay webhook delivery and captured payments without confirmed bookings.
The health route checks database access; it does not prove SMTP/gateway delivery.
Use a process manager and private structured logs without passwords, reset links,
SMTP messages, full customer payloads or payment secrets. Booking records and
email outbox are durable; shutdown waits for active email sends.
