# Nautica — local browser edition

No Android SDK. No emulator. No build step. No npm installation. No internet needed.

## Easiest way to run

1. Extract `Nautica-web.zip` into a folder. Do not open files inside the ZIP preview.
2. Double-click `index.html` in the extracted folder.
3. Use a current Chrome, Edge, Firefox, or Safari browser.

Keep the `vendor` folder and all other files together. Everything is bundled locally, including the QR generator. The app does not contact any external service.

## Optional localhost mode

If your browser blocks storage on `file://` pages, use localhost. If Node.js 20+ is already installed, open a terminal in this folder and run:

```sh
node server.cjs
```

Then open **http://localhost:3000**. You can also use `npm run dev`; no `npm install` is needed. The server binds only to your own computer. Press Ctrl+C to stop.

If Python is already installed, an alternative is:

```sh
python -m http.server 3000 --bind 127.0.0.1
```

Then open the same address. Neither option needs the Android SDK.

## Features

- Eight vessels across Assi Ghat, Dashashwamedh Ghat, Marina Bay, and Lake Como.
- Destination, date, time, vessel-type and 1–30 guest filters with live availability.
- INR/USD currency switch in the main header and inside checkout.
- Included safety kit and three optional extras with a 5% fee and live totals.
- UPI/QR preview, validated interactive card preview, and net-banking selection/search.
- Two-second simulated checkout with duplicate-submit protection.
- Saved local boarding passes, Unicode QR metadata, print/save as PDF, downloadable SVG tickets, and native file sharing when supported.
- Responsive layouts and reduced-motion support.

## Try a booking

Select **Ganges Dawn**, choose extras, then use:

- Lead guest: any name with at least two characters.
- UPI: `alex@okaxis`, or
- Card: `4242 4242 4242 4242`, a future `MM/YY`, any cardholder name, and a three-digit CVV, or
- Net banking: choose one of the provided banks.

Do not enter real card details. All payment methods are simulations; no money is charged. App buttons do not open real payment apps, and the preview payment QR is not a payable merchant request. Boarding passes are demonstration tickets, not valid for real travel.

Amounts are stored in integer INR paise, using a fixed **₹83 = US$1** demonstration rate. Fares reserve the whole boat for one hour. Guest count changes vessel availability rather than the flat vessel fare.

## Saving and sharing

Bookings and currency are saved in this browser's local storage. Clearing browser data removes them. Private browsing may remove them on exit. File-page storage support varies by browser; keep the app at the same path, or use the optional localhost mode for a consistent origin. Data does not sync between browsers, ports, devices, or the native Android app.

Use **Print / Save as PDF** and choose your browser's Save as PDF destination. The downloaded SVG is a standalone scalable ticket with its QR embedded. Native sharing depends on browser/device support; the fallback downloads the pass so you can attach it to email or WhatsApp.

Only lead guest, trip information, totals, and a payment-method label are saved. Full card number, CVV, cardholder field, and UPI ID stay in transient page memory and are cleared after checkout or closing the flow. Saved data is not encrypted. This is a local demo; its unsigned QR credentials are not suitable for real boarding verification.

Dates/times use the device's calendar context. A real multi-destination service needs destination timezones, server inventory, authoritative pricing, signed passes, and verified provider payments.

## Checks

Run dependency-free tests, if Node.js is available:

```sh
npm test
```

Eleven core tests passed: fleet/filter combinations, fee arithmetic, currency conversion, UPI/card/expiry/CVV validation, local date handling, international-text QR generation, and offline asset completeness. JavaScript syntax checks passed. Additional DOM integration checks exercised all three payment modes, rejected invalid inputs, extras, currency switching inside checkout, Unicode passenger data, storage, QR rendering, and reopening passes after reload. The temporary DOM testing dependencies are not needed or included in this app.

No graphical browser tool was available in the delivery environment. Visual layout, actual QR scanning, browser printing, OS file sharing, and mobile device behavior remain to be checked in a real browser. No hosting or public deployment was performed.

## Files

- `index.html`: entry page
- `styles.css`: layout, design, responsiveness, and print layout
- `core.js`: domain data, pricing, filtering, and payment validation
- `app.js`: UI and browser persistence
- `vendor/qrcode.js`: bundled MIT-licensed QR generator; see `vendor/LICENSE.qrcode`
- `server.cjs`: optional dependency-free local server
- `core.test.cjs`: Node test suite
