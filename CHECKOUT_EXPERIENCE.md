# Seat selection, mobile checkout and payment recovery

## Guest experience

Booking follows four visible steps: trip selection on the main page, numbered
seats, passenger details, then payment. The progress indicator identifies the
current step. Guests can change the trip, return to seats or passenger details,
and edit their information before starting checkout. A sticky action area keeps
the current total and next action visible; narrow-screen touch targets remain
at least 44 pixels for the close control and 48 pixels for seats/payment actions.
English and Hindi include the new step, hold and recovery messages.

Seat states have symbols as well as color: circle for available, check for
selected, clock for temporarily held and cross for booked. Held/booked seats are
disabled and skipped by automatic selection. Screen-reader labels state each
seat's position and state. The public API retains `bookedSeats` as the union of
unavailable seats for compatibility and additionally returns `heldSeats` and
`confirmedSeats`. It does not expose another guest's attempt, identity or hold
expiry. Availability polling is a snapshot; the server rechecks every reservation.

## Holds are real server reservations

Merely selecting seats does not reserve them. A Razorpay order creates the existing
15-minute transactional hold; its response now includes `serverNow` and `expires`.
The countdown uses that duration and a monotonic browser clock rather than trusting
the guest's wall-clock setting. It warns at two minutes and shows an explicit
expiry message at zero. Network delay can affect the display; the server deadline
remains authoritative. Hosted checkout is given the remaining timeout as well.

Expiry does not prove that payment failed and does not extend, cancel or release
inventory from the browser. A late capture still follows existing conflict/refund
reconciliation rules. Demo checkout creates no real provider hold or payment and
does not show a misleading countdown.

## Read-only recovery after an uncertain payment

A dismissed Razorpay checkout, an unsuccessful verification response, or a long
wait takes the guest to recovery. After 30 seconds without a result, the UI offers
that recovery view instead of an endless processing screen. An already-open
provider window can remain in the foreground until closed/completed.

Recovery automatically checks the current attempt once and offers a manual status
refresh and account-history link. It never creates another order, charges again,
marks money paid, or retries a refund. Closing checkout is not treated as a seat
conflict; it does not clear the attempt and offer a second payment. A confirmed
stored booking opens its boarding pass; the UI ignores late duplicate callbacks
once it has accepted a confirmed result.

`GET /api/payments/status?requestKey=<UUID>` requires the customer session and
checks both request key and customer ownership. Unknown keys and another customer's
keys both return `not_found`. The response allows only status, server time, hold
expiry and the requesting customer's projected boarding pass when present. It
uses no-store responses and shared limits. No merchant credentials, order/provider
payloads, database records or other guests' information are exposed.

This lookup checks shared stored state. It does not independently poll Razorpay or
prove that an absent attempt was never charged. Missing webhooks/provider evidence
may require operator reconciliation. Until that is resolved, the guest is told to
check history or seek support rather than pay again. A page reload loses the modal's
in-memory context; signed-in booking/payment history remains available in Account.
Request keys, passenger drafts, provider signatures and hold context are not saved
in browser storage by this flow.

## Validation

Browser tests cover unavailable-seat symbols, auto-selection, the server-duration
countdown and expiry warning, separate passenger/payment steps, preserved drafts,
read-only recovery on a failed connection, and hosted checkout dismissal followed
by recovery without a second order. MongoDB integration verifies held/confirmed
seat transitions, unauthenticated/cross-account access, projected status responses,
one order and one payment. Existing capture, seat conflict, late payment, refund,
privacy and multilingual tests continue to apply. Live Razorpay behavior and
physical-device usability still need the controlled pilot described in
[BACKUP_RESTORE_PILOT.md](BACKUP_RESTORE_PILOT.md).
