# Nautica

Native Android boat-charter booking demo built with Kotlin, Jetpack Compose Material 3, Navigation Compose, MVVM/StateFlow, and Preferences DataStore. Android 8.0+ (API 26).

## Run

Open this directory in a current Android Studio, select JDK 17 or 21, install Android SDK Platform 35 and Build Tools, and sync Gradle. Run the `app` configuration on an emulator or Android device.

```sh
./gradlew testDebugUnitTest assembleDebug
```

The Gradle 8.11.1 wrapper is included. Initial sync needs internet access. On Windows, use `gradlew.bat`. No API keys or backend configuration are required.

## Included

- Eight distinct vessels across Assi Ghat, Dashashwamedh Ghat, Marina Bay, and Lake Como, with capacity, ratings, amenities, and vector-drawn headers.
- Destination, date, time, vessel type, and 1–30 guest filters, including a Material 3 search/filter bottom sheet and date dialog.
- Global reactive INR/USD preferences; badges count locally saved passes dated today or later.
- Trip summary, included safety equipment, optional refreshments, photographer, and guide. Fees are 5% of fare plus add-ons, rounded to the nearest paise.
- UPI ID validation and app selection, preview payment QR, card network detection and Luhn/expiry/CVV validation, a live formatted card preview, and searchable net-banking selection.
- Two-second simulated checkout, guarded against repeat taps, followed by an animated confirmation and perforated boarding-pass layout.
- Unique booking references, metadata QR codes, local offline pass history, PDF download through Android's document picker, and sharing through Android Sharesheet/FileProvider.
- Unit tests for payment validation, networks, and price calculations.

## Pricing and payment contract

All amounts are stored as integer INR paise. A fixed demonstration rate of **₹83 = US$1** converts every displayed price, extra, fee, and saved total consistently; it is not a market exchange-rate feed. Example: ₹1,200 = $14.46; the ₹1,500 photographer costs $18.07. Fares reserve one private vessel for a one-hour trip, so changing guest count affects availability rather than the flat vessel fare.

Every payment path is explicitly simulated. UPI app buttons select the simulated method; they do not launch or charge an app. The checkout QR encodes a clearly marked demo payload, not a payable merchant address. The boarding-pass QR is a real scannable encoding of the booking metadata. PDF exports are labeled as demo passes. No full PAN, CVV, or UPI ID is written to DataStore; saved methods contain only network/last four or provider name.

## Code map

- `model/`: serializable domain objects, currency formatting, pricing, payment validation
- `data/`: mock fleet, DataStore repository, QR-backed PDF export/share
- `viewmodel/`: trip state, currency/history streams, checkout state machine
- `ui/theme/`: maritime colors and Material theme
- `ui/components/`: vector vessels, QR rendering, reusable pricing UI
- `ui/screens/`: fleet, trip, checkout, pass, offline history
- `MainActivity.kt`: application shell, navigation, currency toggle, active pass badge

## Release boundary

This is a self-contained implementation of the requested mock-data and simulated-payment workflow, not a live booking service. Before a public release, integrate authoritative inventory and pricing, a server-created payment-provider checkout, verified payment webhooks, expiring/signed boarding credentials and pier-side verification, authentication, cancellation/refund policies, accessibility/device testing, release signing, and an appropriate privacy policy. Do not collect raw card details in a production version; use the payment provider's hosted/tokenized UI.

Pending checkout state is retained across rotation by the ViewModel but not restored after process death. Completed bookings and currency persist locally. Device-local mock booking dates use the device timezone; a live service must use each destination's timezone. Local JSON storage has no schema migration policy yet. PDF export runs on an IO dispatcher. The card preview is a styled gradient illustration, not a physically rotating 3D object. Custom illustrations are illustrative, not photos of actual charter vessels.

See `VALIDATION.md` for checks actually performed in the delivery environment.
