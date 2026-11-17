# Device acceptance checklist

These checks require an Android emulator or device. They are not claims of checks already run.

1. Launch on API 26 and API 35, including a narrow phone and increased font size. Check scrollability, readable labels, back navigation, and keyboard behavior.
2. Select each of the four piers. Confirm two vessels per pier, then filter vessel type and increment guests until an empty state appears. Open the filter sheet and ensure edits immediately match the fleet.
3. Choose today and tomorrow through the date dialog. Past dates must be unavailable. Change all four time slots.
4. Switch INR/USD on fleet, trip, payment, and saved pass screens. Verify all fares, extras, fees, and totals use ₹83/USD. Restart and verify the preference persists.
5. Select add-ons and verify a 5% fee on fare plus add-ons. Safety kit must stay included. Verify guest count is retained in the trip and pass.
6. Try empty or malformed UPI IDs, a card with a bad Luhn digit, an expired or invalid month, a short cardholder name, and mismatched CVV length. Each must prevent checkout. Test card formatting and Visa/Mastercard/Amex/RuPay previews. Try all UPI app selections and the bank search.
7. Pay with valid demo details, such as UPI `alex@okaxis` or Visa `4242424242424242` with a future MM/YY and three-digit CVV. Ensure the two-second processing dialog blocks duplicate taps and back navigation. Confirm a single saved pass and an updated badge.
8. Scan the boarding QR with a separate scanner and inspect the booking metadata. Save the PDF through the system picker and open it. Share through an installed app and verify attachment access. Cancel the picker without an error.
9. Force-stop and reopen with airplane mode enabled. Open My passes and verify the saved reference, trip, extras, and total. Create another booking and verify the first remains available.
10. Rotate while editing checkout and during processing. Completed passes must remain; the current payment fields may clear for privacy. Kill the app before payment completes: an unfinished checkout must not appear as paid.
