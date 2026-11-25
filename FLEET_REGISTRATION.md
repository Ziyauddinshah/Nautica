# Boat registration — India / Varanasi

Owners sign in at `/owner`, create a draft, enter the actual boat's details and upload private supporting documents. Administrators use `/admin/fleet` to register boats or review owner submissions. Existing customer accounts can submit a boat; submission does not grant an approved owner role or permission to sell trips.

Only approved boats appear in the customer catalogue. Draft, pending, rejected, suspended and expired-document boats cannot accept new bookings, including requests made directly to the API. The server validates document validity for the requested travel date and derives capacity, seats and fare from the registered record. Test/sample boats are never automatically registered or approved in the running application.

## Initial platform checklist

The initial review policy in `src/domain/fleet.js` covers:

- Boat registration and the issuing authority.
- Ownership or operator authorization.
- Passenger operation / local permission for the actual operating area.
- Survey / fitness, insurance and safety equipment inspection.
- Captain / operator qualifications.
- Numbered seat layout and evidence of certified passenger capacity.

The declared life-jacket count must cover all passengers plus the captain. The generated numbered seating diagram must match the uploaded layout and actual boat before approval. Passenger capacity is currently limited to 60; the captain has a separate position. Only Assi Ghat and Dashashwamedh Ghat are supported initially, with India time and INR pricing. Boat art is illustrative; it is not a verified photograph.

This is a conservative platform admission checklist, **not an exhaustive legal checklist or legal authorization**. Requirements vary with propulsion, vessel class, operating area and applicable state/local rules. Admins must confirm requirements and document authenticity with competent authorities, including the relevant Varanasi/local authorities, and record verified authority references in review notes. Do not fabricate expiry dates or upload unrelated certificates. Resolve applicability with the authority and configure the platform policy before admitting a class whose documents differ. Changing policy requires a code review, tests and rechecking existing approvals; do not silently relax live requirements.

Official starting references (reviewed 25 November 2026):

- [IWAI: Inland Vessels Act 2021 and Jalyan/Navic portal](https://www.iwai.gov.in/inland-vessel-act-2021-and-jalyan-navic-portal)
- [Ministry of Ports, Shipping and Waterways: Inland Vessels Act](https://shipmin.gov.in/en/content/inland-vessels-act-2021)
- [India Code: Inland Vessels Act 2021](https://www.indiacode.nic.in/bitstream/123456789/17048/1/aA2021-24.pdf)

These national sources do not establish an exhaustive Varanasi checklist, particularly for manually propelled boats. Obtain local verification before commercial launch.

## Review and operational controls

Uploads and edits produce drafts. The submitting owner/admin declares authenticity and submits for review. An admin must check ownership, registration, seating/capacity, safety, insurance, permissions, captain qualifications and independence from ownership/conflicts, and supply review notes. An admin who created a boat cannot approve their own submission; another admin account is required. Admins should never approve boats in which they have an interest, even when they also have a separate customer account. Account separation cannot establish human independence; enforce that organizationally.

Every mutation uses a revision number and a majority-committed MongoDB transaction with audit history. Duplicate registration identities are rejected. Owners can only access their own records and document downloads; admin and customer cookies remain separate. Admins can inspect all submissions but may edit only their own drafts. They can reject with a reason or suspend approved boats immediately.

Upcoming confirmed bookings and active checkouts block owner changes to boat details/documents. Suspension blocks new sales but preserves existing tickets and payments; operations must contact affected guests and reconcile cancellation/refund obligations. A captured payment that cannot become a valid booking is flagged `refund_required`; it is **not automatically refunded**. Review payment attention in the admin dashboard and refund through the payment provider.

New checkouts and confirmations fence the boat record inside the same transaction as inventory. A concurrent edit/suspension cannot commit against a stale approval. A completed booking can still be recovered by its original idempotency key after suspension. Existing bookings contain immutable public boat snapshots and remain visible in history, passes and payment records.

## Private document storage and scanning

PDF, PNG and JPEG files up to 5 MiB are allowed. File signatures and MIME types are checked; HTML/SVG and mismatched types are rejected. This validation alone does not prove a file safe. Production uploads require a configured private ClamAV `clamd` service via `CLAMAV_HOST` / `CLAMAV_PORT` (default 3310). Scanning errors or infections fail closed. Keep clamd patched, signatures updated, stream limits above 5 MiB, and port 3310 isolated on a trusted private network. The stream uses private TCP, so use a secure private tunnel if hosts cross untrusted networks. `npm run production:check` checks configuration presence, not scanner health; exercise an upload in staging.

Local development may store uploads as `not_scanned`. Production will neither approve nor sell such boats; re-upload clean-scanned documents and re-review them before launch. Do not use untrusted documents on a development machine without a scanner.

Bytes, SHA-256 digest, upload actor and metadata are stored in private MongoDB collections. They therefore work across app servers without local upload folders. Downloads require authorization and use attachment, no-store, nosniff and sandbox headers. Public catalogue/pass responses never include private documents, operator legal identity, registration numbers or review notes.

Replaced documents remain retained for audit; limits are 64 uploaded versions or 100 MiB per boat. Owners may have at most 10 unfinished registrations. HTTP writes also have shared rate limits. Plan retention/deletion, access review, encryption at rest, TLS, backup/restore and regulatory privacy procedures before launch. Database backups now contain sensitive documents and must be protected accordingly. These controls do not certify legal compliance.

## Upgrade existing installations

Deploy the web branch, run `npm ci`, `npm test` and `npm run build`, then start normally. Startup creates fleet indexes alongside the existing schema. No `db:init`, deletion or repeat SQLite migration is needed for an initialized database. All servers must run the updated version before accepting fleet bookings; older server versions lack approval enforcement.

Register each real boat and obtain admin review. Existing sample IDs such as `b1` will no longer be sold; historical bookings stay intact. Do not map a historical sample ID onto an unrelated real boat. Reconcile any upcoming legacy bookings with their passengers and the actual operator. If an admin registers boats, create a separate reviewer using `npm run admin:create` as described in local setup.

Owner verification is now mandatory: see [OWNER_VERIFICATION.md](OWNER_VERIFICATION.md). Admins must register boats against a verified owner email. Legacy ownerless admin boats require an explicit owner link and fresh independent review. Missing/expired owner verification blocks new sales while preserving history.
