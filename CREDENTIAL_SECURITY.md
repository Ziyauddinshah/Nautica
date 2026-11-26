# Customer credential hardening

## Email proof and existing accounts

New and existing customer accounts are unverified until the current mailbox is
proved. No bulk migration assumes that an old email address was verified. Users
can still sign in, view owned records, recover/change their password and handle
existing journeys. They must verify before creating a new booking/payment order,
registering a boat or starting owner-verification actions. Existing authoritative
captured-payment settlement can finish safely; its customer emails remain gated.
All running replicas must be upgraded together; older versions do not enforce the
new rules. No database reset or repeat SQLite migration is needed.

Registration requests a verification email when Gmail SMTP and the trusted public
origin are configured. Account, public booking and owner screens also provide a
rate-limited resend action. A mail request is not proof of delivery. No booking or
payment details are included in the verification message. The current email is
read from the signed-in database account, not a caller-selected recipient.

The link carries a random 256-bit token in a URL fragment. Only its SHA-256 hash is
stored in the separate `email_verifications` collection. The token expires in 15
minutes, is bound to account ID, current email and authentication version, and is
consumed transactionally once across replicas. A replacement link invalidates the
previous one. Expiry is checked explicitly rather than relying on TTL cleanup.
Password changes/resets invalidate pending proofs. Email changes made by future
features must re-prove the new address; verification is bound to the exact stored
address, not just a timestamp.

The browser removes the fragment before React/StrictMode mounts and keeps the
token only in memory. Opening a link does not verify automatically. The customer
must sign in to the same account and explicitly confirm through a same-origin
POST. If opened on another device, leave the verification page open, sign in in
another tab, then use **Reload session**. Reloading the browser page loses the
in-memory token; request a new link if necessary. Do not paste verification links
into support tickets or screenshots. A verification link is not a login token and
cannot reset a password. An account pre-created by someone else must be recovered
through the mailbox with a new password before using it; do not share credentials
or forward links to the person who created it.

## Booking email privacy

Customer booking/aftercare emails require verified recipient ownership. Known
booking/boat recipients are checked against their linked account ID and current
email, not just an arbitrary verified address. New notices retain recipient account
IDs where appropriate. Admin routing remains private configured operational routing.

Unverified jobs become `verification_required`, keep their delivery-attempt budget,
and are released on successful verification. Workers periodically recheck these
jobs every five minutes, covering a verification/defer race without sending to an
unverified address. Customers see the verification status in account notification
history. Unlinked historical notices or mismatched addresses need operator review;
do not bulk relabel them verified or reassign private records merely to clear a
queue. Original sending before this rollout cannot be recalled. Review old queues
and access/retention obligations during deployment.

This feature proves mailbox access, not a person's legal identity or mobile number.
It is not customer MFA. Owner identity/mobile verification and mandatory admin MFA
retain their separate requirements. Account registration can still reveal that
an email may already be registered; complete enumeration resistance remains a
separate enhancement.

## Common and breached passwords

Every newly registered, changed or reset customer password, and every password set
through the trusted admin CLI, must satisfy the existing 12–256-character policy
and a local common-password/repetition/numeric-pattern blocklist. Existing stored
passwords are not silently changed or checked through an external service at login.
Users can sign in with their existing password and choose a safer replacement.
The local blocklist is deliberately limited, not an exhaustive offline breach dump.

Production repositories additionally require **Pwned Passwords** range screening
at `https://api.pwnedpasswords.com/range/`. No API key is required. The server computes
a SHA-1 fingerprint for the lookup only; this is not the stored password hash. It
sends only the first five hexadecimal characters with `Add-Padding: true`, then
compares suffixes/counts locally. Neither the password, full hash, email, account
ID nor payment information is sent. The provider sees the server IP, lookup prefix
and timing; review that processing in your privacy/provider arrangements.

Allow validated HTTPS egress to that host. Requests have a five-second timeout,
reject redirects, validate the response format and bound response size. A reported
compromise is rejected. Outage, malformed response or TLS failure stops **new
password creation** with a safe temporary error; it never silently skips production
screening. Existing-password login continues to work. There is no production
HTTP/environment bypass. Development uses the local blocklist; automated breach
checks inject fake range responses, never real credentials. Test actual egress on
the intended deployment without submitting a user's real password to diagnostics.

## Non-blocking hashing and compatibility

The MongoDB runtime and admin MFA use Node's asynchronous `scrypt`, not synchronous
password hashing on the event loop. A per-process admission limit permits four
active derivations and 32 queued requests; excess work returns a safe busy response.
Shared login/reset/change throttles still apply. Native crypto workers consume CPU
and memory; provision/monitor those resources rather than assuming async means free.

Customer scrypt parameters remain N=32768, r=8, p=3, 64-byte output with a random
16-byte salt. Existing admin hashes keep their compatible prior parameters. Hash
comparison uses `timingSafeEqual`. Login does expensive password verification outside
a MongoDB transaction, then conditionally writes the current user's login fence
and creates a session; a concurrent password change cannot issue a usable session
against an obsolete hash. Auth-version checks still revoke older sessions.

Legacy synchronous SQLite helpers remain for offline migration/regression tests;
the online runtime never falls back to them. Upgrading does not rewrite hashes,
change passwords, invalidate all customer records or create a second database.
No real registration email, password lookup or live credential reset was performed
in automated tests. Tests use synthetic accounts, provider fakes and local replica
sets, including email-proof replay/races and held-mail release.

## Deployment and remaining work

Deploy compatible code to every replica, retain one shared database and configure
Gmail SMTP plus exact HTTPS `PUBLIC_ORIGIN`. Startup creates the verification TTL/
account indexes. Tell existing customers to sign in and verify before new purchases.
Keep proof/reset links, passwords, cookies and raw provider responses out of logs.
Run the contributor checks and credential/MongoDB/privacy suites before rollout.

This implements email proof, new-password screening and non-blocking hashing. It
does not add customer passkeys/MFA, a session-management dashboard, security-change
notifications or admin idle timeout. Admin MFA, secure cookies, token expiry,
password-reset single use and password-change session revocation remain in place.
See [SECURITY.md](SECURITY.md) and [the access guide](docs/ACCESS_PRIVACY_SECURITY.md).
