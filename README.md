# Nautica — React + Vite

A boat and water-charter booking frontend built with **React 19 and Vite**. Explore eight vessels, choose numbered seats, customize your trip, try a simulated payment, and keep a digital boarding pass.

## Run locally

Install **Node.js 22.12+** (an LTS release is recommended). No Android SDK is needed.

```sh
git clone --branch web https://github.com/Ziyauddinshah/Nautica.git
cd Nautica
npm install
npm run dev
```

Open **http://localhost:3000**. If that port is occupied, Vite prints the alternative URL. First installation needs internet access; the app itself makes no external API calls.

Unlike the previous plain-JavaScript version, this React source must run through Vite. Double-clicking `index.html` will not launch it.

## Checks and production build

```sh
npm test
npm run build
npm run preview
```

`npm run build` creates the static production bundle in `dist/`. Preview serves it locally. Use `npm ci` instead of `npm install` for an exact installation from the committed lockfile. `npm run test:watch` watches tests while developing.

## Included

- Fleet filtering by destination, type, and 1–30 guests; date and time selection.
- Top-down numbered seating diagrams with front/rear, left/right, and captain labels. One distinct seat per guest is required. Layouts are illustrative private-charter preferences; confirm actual layouts with the captain.
- Reactive INR/USD currency, extras, and a 5% fee. The demo rate is fixed at ₹83/USD, and fares reserve the whole vessel for one hour.
- Three validated demo payment methods: UPI/QR, live card preview with Luhn/expiry/CVV validation, and bank selection/search.
- Two-second simulated processing, duplicate-submit protection, and storage-error handling.
- Browser-persisted passes, Unicode QR metadata, selected seats, print/save as PDF, standalone SVG downloads, and supported native sharing.
- Responsive maritime styling, semantic forms, keyboard-accessible seat buttons, payment tabs, and reduced-motion support.

Payments are simulated. No money is charged and demo tickets are not valid for real travel. QR credentials are unsigned. Live inventory, a payment provider, verified webhooks, destination timezones, and signed boarding credentials are required before real bookings.

## Source structure

```text
src/
  App.jsx                  # Fleet, filters, currency, pass history
  main.jsx                 # React entry point
  components/
    BoatArt.jsx            # SVG fleet illustrations
    SeatMap.jsx            # Controlled numbered seating diagram
    BookingDialog.jsx      # Trip → payment → confirmation state
    PaymentForm.jsx        # Controlled inputs and validated methods
    BoardingPass.jsx       # Pass, QR, print, export, sharing
    TripSummary.jsx        # Shared trip and pricing components
    QrCode.jsx              # Memoized QR renderer
  domain/booking.js        # Fleet, pricing, seat rules, validation
  lib/storage.js           # Legacy-compatible local persistence
  lib/qr.js                # Locally bundled QR generator
  lib/passExport.js        # SVG file export and share helpers
  styles.css               # Responsive and print styles
tests/                     # Vitest + React Testing Library tests
```

This uses React state and component events throughout; it does not embed the legacy DOM controller. QR markup is the only generated SVG inserted as HTML, and it comes exclusively from the bundled QR library.

See [LOCAL_SETUP.md](LOCAL_SETUP.md) for test data, storage migration, and browser limits. The native Android source remains on the separate [`android` branch](https://github.com/Ziyauddinshah/Nautica/tree/android).
