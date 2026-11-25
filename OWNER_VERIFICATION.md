# Boat-owner identity and mobile verification

Owners must verify their mobile number and legal identity at `/owner` before creating or submitting a boat. Owners can still see existing records when verification is unavailable. Admin-created boats must identify an already verified owner by registered email. Approval, edits, document uploads and new checkout/booking confirmation check the owner's current verification on the server. Client flags cannot grant verification.

This release implements TextBee mobile OTP verification and **prepares a hosted identity-provider integration**. It does not connect directly to UIDAI or claim to verify an Aadhaar number. No Aadhaar provider has been selected or configured. New registration remains blocked until a trusted identity integration is configured and the owner completes both checks. Existing tickets/history remain available.

## Mobile verification with TextBee

Configure existing server-side `SMS_ENABLED=true`, `TEXTBEE_API_KEY`, and `TEXTBEE_DEVICE_ID`, plus a cryptographically random `MOBILE_OTP_SECRET` of at least 32 characters, shared by all app replicas. Generate at least 32 random bytes privately, for example with Node's `crypto.randomBytes(32).toString('hex')`. Never commit the secret or expose it through `VITE_*`. Restart all replicas after changing configuration.

The owner explicitly consents and requests an SMS to an Indian mobile number (+91, ten local digits beginning 6–9). Codes have six random digits, expire after five minutes and allow five incorrect attempts. The server enforces a 60-second resend cooldown and shared IP/account rate limits. Resends replace earlier challenges. OTPs are HMAC protected with user, challenge and destination binding; plaintext codes are neither stored nor returned to the browser. Successful verification consumes the challenge transactionally and updates the account's phone. Verification is valid for 180 days and must continue to match the account's current phone.

TextBee acceptance is not delivery proof. Only entry of the correct, current code verifies the number. Failed/uncertain sends do not create a usable challenge and are not automatically resent. TextBee itself and the receiving handset necessarily see the SMS; protect provider/device access and set suitable SMS retention. Configure any applicable commercial SMS sender/template requirements before launch.

## Aadhaar and alternative identity — pending provider selection

Choose a provider authorized for the intended verification mode and your business's use case, complete its onboarding, then implement the small **merchant-controlled bridge contract below**. These are Nautica's bridge endpoints, not UIDAI endpoints or a claim that any particular vendor offers this API. Vendor-specific credentials and the vendor's Aadhaar flow belong in the bridge. No provider costs, enrollment or live identity checks are performed by this code.

The bridge must host an informed-consent Aadhaar flow and a viable alternative identity flow, verify evidence according to its authorized process, bind results to the supplied subject/request, and support expiry/revocation procedures. A number checksum or uploaded image is not identity verification. Nautica does not offer a full Aadhaar-number input, accept Aadhaar OTPs, inspect Aadhaar XML, or store Aadhaar numbers, biometrics, PID blocks or document images for this feature. Do not upload Aadhaar cards among boat documents. Storage of other boat documents is separate and requires its own access/retention controls.

UIDAI references, reviewed 25 November 2026:

- [Aadhaar Act](https://uidai.gov.in/en/aadhaar-act)
- [Authentication and Offline Verification Regulations, clean copy dated 30 December 2025](https://www.uidai.gov.in/images/The_Aadhaar_Authentication_and_Offline_Verifications_Regulations_2021-_Clean_copy-30122025.pdf)

Verify current requirements with the provider and competent advice before production, including consent, alternatives, permitted purposes, operator eligibility, data location/security, retention and withdrawal. This implementation does not establish regulatory approval.

### Configuration

Set privately, on every app replica:

```
IDENTITY_BRIDGE_URL=https://your-private-bridge.example/api
IDENTITY_BRIDGE_KEY=<strong server-to-server key, at least 32 characters>
IDENTITY_CHECKOUT_ORIGIN=https://your-authorized-checkout.example
```

Only HTTPS is supported. Redirects from bridge HTTP requests are rejected. Returned hosted URLs must have exactly the configured checkout origin, with no embedded username/password or fragment. Do not include Aadhaar or other personal details in URLs. Bridge keys and base URLs never go to the browser; the opaque hosted session URL does.

### `POST /sessions`

Nautica calls the bridge with a Bearer key and JSON:

```
{
  "subject": "<Nautica user ID>",
  "requestId": "<server-generated UUID>",
  "method": "aadhaar",
  "purpose": "boat_owner_registration",
  "consentVersion": "owner-identity-v1"
}
```

`method` is `aadhaar` or `alternative`. Create an idempotent provider session for this exact subject/request and return:

```
{"id":"session_opaque_reference", "url":"https://your-authorized-checkout.example/session/opaque-token"}
```

Session IDs must be opaque ASCII references of 8–150 characters (letters, digits, underscore or hyphen), never Aadhaar numbers. The bridge must preserve purpose and method and prevent session swapping. Check authorization on both bridge endpoints. The browser returns to `/owner` after completing the provider flow and selects “Check identity verification status”; client return parameters never grant verification.

### `GET /sessions/:id`

After independently checking the selected provider's authentic result, the bridge returns:

```
{
  "id": "session_opaque_reference",
  "subject": "<same Nautica user ID>",
  "requestId": "<same server-generated UUID>",
  "method": "aadhaar",
  "status": "verified",
  "name": "<verified legal name>",
  "consentVersion": "owner-identity-v1",
  "expiresAt": "<future ISO timestamp, no more than 366 days away>"
}
```

Use the provider's verified legal name, not a name supplied without verification. Require appropriate identity-holder binding in the provider flow; verifying that a number exists is insufficient. The legal name must match the account name after Unicode/whitespace/case normalization. Support must arrange an authenticated name correction for existing accounts with an incorrect name; do not bypass verification or edit verified receipts to match.

Return a non-verified status while incomplete or failed. Do not return Aadhaar numbers, last-four digits, other identity document numbers, biometric material, Aadhaar OTPs or raw vendor payloads. Nautica stores only the bounded legal name, method, opaque provider reference, consent version/time and validity. Each result must match all stored session bindings; an owner-supplied “verified” flag or receipt is never trusted. The bridge response itself is trusted server-to-server evidence, so protect its keys, endpoints and provider callback validation.

Nautica currently uses explicit server-side result polling, not provider callbacks. A provider's remote revocation is not automatically pushed into Nautica. Before commercial launch, implement and test the chosen provider's revocation integration, monitoring and consent withdrawal process, set an appropriate verification validity period, and suspend affected boats immediately when required. Expired or missing local receipts already prevent new sales. This integration preparation must not be represented as a completed vendor connection.

## Existing boats and multi-server rollout

All app replicas must run the new code and share the MongoDB database and OTP secret. Startup creates `owner_verifications` and TTL-indexed `mobile_challenges`; no data reset or repeat migration is required. Completed verification persists across devices/servers. Phone and identity grants are fenced in booking transactions, so concurrent changes cannot be sold against a stale verification.

Existing approved boats are hidden and cannot accept new sales until their linked owner completes both checks. Historical passes and payments remain accessible. Legacy admin-created boats without an owner can be linked by an admin to a verified account in `/admin/fleet`, after checking authority and recording a reason. Linking resets the boat to draft and requires fresh independent review. It preserves tickets but can cause active paid checkouts to need refund attention; reconcile operations before linking. This action does not support transfers from an already linked owner.

Identity data and phone numbers remain personal data. Restrict database and backup access, use TLS/encryption at rest, and implement the merchant's approved retention/deletion and withdrawal procedures. MongoDB TTL removes expired OTP challenges; durable verification receipts are not automatically deleted solely on expiry. Public boat listings and customer passes never include owner identity receipts or OTP hashes.
