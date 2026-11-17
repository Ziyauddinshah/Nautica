# Running and testing Nautica React

## Development

Use Node.js 22.12 or newer, then run `npm install` and `npm run dev`. Open the URL Vite prints (normally http://localhost:3000). No Android SDK or emulator is required. Package installation needs internet; once installed, the app and bundled assets have no runtime external dependencies. A service worker is not included, so reopening a remote website while offline is not guaranteed.

To check a production build, run `npm run build` then `npm run preview`. Serve the resulting `dist/` directory through a static web server; do not open its HTML via file://. The Vite relative base supports deployment under a subdirectory. Production hosting is not configured by this migration.

## Demo booking

1. Click **Choose seats** on a vessel.
2. Choose one seat per guest, or click **Choose seats for me**.
3. Choose your extras and proceed to payment.
4. Enter a lead guest name and use one of these test methods:
   - UPI: `alex@okaxis`.
   - Card: `4242 4242 4242 4242`, any cardholder name, a future MM/YY, and a three-digit CVV.
   - Net banking: choose a supported bank; the search includes other banks.
5. After the two-second simulation, open **My passes** to reopen the saved ticket.

Use test details, not real payment credentials. No UPI apps are launched, no bank is contacted, and the payment QR is a marked demo payload. Numbered seat diagrams are illustrative preferences inside a private charter, not shared inventory or verified vessel blueprints.

## Persistence and migration

The React version retains `nautica.web.currency` and `nautica.web.passes`, the previous app's local-storage keys. Existing valid passes remain available when served from the **same browser origin** (scheme, hostname, port). Older passes without seat assignments show **Not selected**. Storage writes merge current saved passes to retain bookings made in other tabs.

File://, localhost, 127.0.0.1, and different ports have different storage contexts. Data from the old file:// page does not automatically transfer to localhost. Clearing browser data removes bookings; private browsing may discard them on exit. Bookings do not sync to other devices or the native Android app.

Only lead guest, trip, seat choices, extras, total, and a method label are saved. Full PAN, CVV, cardholder input, and UPI ID remain transient React state and are discarded when checkout closes or succeeds. Storage is not encrypted. A storage failure prevents a false booking confirmation. Unfinished checkout is not restored after a reload.

## Pass export

**Print / Save as PDF** opens the browser print dialog. Select Save as PDF if available. **Download pass** creates a standalone SVG with the QR embedded and grows to fit long seat lists. **Share pass** uses supported system sharing, otherwise downloads the file for attachment to email or WhatsApp. Sharing varies by device and browser.

## Validation limits

Vitest checks domain rules and React interactions using jsdom: filters, seat limits, currency, checkout validation, all three methods, persistence, and storage failure. The production bundle is verified by Vite. No graphical browser tool is available in this workspace, so visual layout, real QR scanning, actual print dialogs, OS sharing, and device behavior still need browser acceptance testing.

Dates/times use the device calendar context. Exchange rates are fixed at ₹83/USD, and fares are flat private-vessel prices. This is a frontend demonstration, not an inventory or payment service.
