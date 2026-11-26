# Journey shortcuts, cancellation preview and accessible boat listings

## Next journey

Account now shows the nearest confirmed, unfinished journey independently of the
currently selected history tab/page. `GET /api/user/next-journey` requires the
customer session and selects only that customer's records using the shared server
history rules. It excludes cancelled/finished trips and orders by departure.
The card shows seats, boarding-pier-local departure, meeting instructions and the
boarding pass. A pending cancellation disables the pass shortcut and warns that
boarding is paused. Data refreshes with the existing account/background refresh;
the card is hidden if its lookup fails rather than showing another account's data.

Directions open Google Maps only when clicked, with the pier/location as the
query, no booking ID, guest name or browser referrer. There is no embedded tracker
or automatic location permission request. Pier directions are approximate; guests
must confirm the exact berth with the operator. Operators should provide useful
meeting instructions in the reviewed registration details.

## Cancellation preview and explicit confirmation

Server cancellation projections include `estimatedRefund`, `currency: INR` and
`estimateOnly`. An eligible confirmed booking with a recorded paid/demo-paid amount
shows the full stored amount; expired/ineligible/unpaid cases show zero. The saved
policy and boarding-pier departure determine the cutoff. Request submission still
rechecks eligibility against the server/database clock, so a preview does not
reserve eligibility. Pending requests show their existing status/refund progress.

Before requesting cancellation, customers see the deadline, estimate and stages:
request pauses boarding; admin review precedes seat release; provider processing
and bank credit follow approval. A second confirmation is required after entering
a reason and accepting the policy. “Keep my booking” closes that confirmation
without a request. Editing the reason/policy acceptance invalidates the preview
confirmation. The existing approval, refund evidence, inventory release and audit
rules remain authoritative. Demo bookings explicitly state that no real money
will be refunded; neither an estimate nor approval proves money was returned.

## Reviewed listing content and actual photos

Public cards expand to show description, boarding instructions, amenities, safety,
life-jacket count and accessibility/boarding-assistance notes. Missing information
is stated explicitly; absence is not treated as wheelchair access or a safety
certification. Owners/admin submitters can edit those fields and optional Hindi
versions in the registration form. Provided Hindi text is preferred in Hindi UI;
otherwise original content is shown without inventing a translation. Every such
edit follows the existing new-review and active-booking/hold restrictions.

A submitter can upload one actual JPEG/PNG listing cover photo (up to 5 MB), provide
screen-reader description and declare publishing rights/no private information.
The server checks ownership and revision, requires a clean malware scan, decodes
with a 20-million-pixel limit, rotates/re-encodes as JPEG, removes EXIF/metadata and
limits output to 1200×900 and 500 KB. Original uploads are not retained. The
sanitized cover is stored in shared MongoDB, outside legal-document files. The
local/test scanner must also be configured to accept photos; missing/unavailable
scanning fails closed. Do not weaken this to work around setup errors.

Uploading/replacing a photo changes the listing to draft and requires independent
review. Owner/admin review screens have an authenticated photo preview; other
owners cannot access it. Reviewers must visually inspect accuracy, faces/plates,
private information and publishing rights. Automated scanning/metadata removal
cannot guarantee that the photographed content is lawful or non-personal.

The public photo endpoint serves only approved, currently document-valid and
owner-verified boats as `image/jpeg`, with `nosniff` and `no-store`. Draft/rejected/
suspended photos are not public. Public responses contain only the photo URL/alt
text, not original bytes, legal documents, registration identities or owner details.
The frontend accepts only Nautica's same-origin media URL format, with no arbitrary
external photo hosts. Illustrations remain clearly labeled where no real photo
has been supplied or an image fails. This change does not provide actual photos
of the operator's boats; the authorized owner must upload and obtain review.

An already downloaded image cannot be recalled when a listing is suspended.
Handle publication consent, retention and requests under the operator's privacy
process. Existing backups now also contain sanitized photo data; maintain backup
access/encryption/retention accordingly. No production photo or private document
was uploaded during automated validation.

## Keyboard, language and readability

Seat buttons retain position/state labels, disabled holds/bookings, symbols and
native Enter/Space selection. Arrow keys move to available seats; Home/End move
toward the first/last available seat. Account tabs support arrows/Home/End with
managed focus. Public/account pages have skip links; checkout stages focus their
heading. Visible focus, minimum 44-pixel controls, reduced-motion preferences,
forced-color states and responsive cards support additional access needs.
New static text and optional listing fields support English/Hindi. Automated DOM
checks do not constitute a WCAG audit; test real screen readers, 200% zoom,
keyboard-only navigation and physical mobile devices during the pilot.

## Validation

Tests cover refund estimate/cutoff/unpaid cases, the second confirmation with no
request on dismissal, keyboard navigation and Hindi content, EXIF stripping,
unscanned/corrupt/unauthorized uploads, draft/approved/suspended photo visibility,
private media access and owner-scoped next-journey API responses across replicas.
See [CONTRIBUTING.md](CONTRIBUTING.md) for check commands and
[BACKUP_RESTORE_PILOT.md](BACKUP_RESTORE_PILOT.md) for controlled live acceptance.
