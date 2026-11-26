# Third-party access, privacy and security controls

This guide covers developers, contractors, support staff, boat owners and service
providers. It describes application controls and operational controls the operator
must configure. It is not a statement of legal certification or a completed
privacy impact assessment. Obtain appropriate legal advice for the business's
India/Varanasi operations and its actual processing/sharing arrangements.

## Access matrix and important limits

| Person/service                      | Intended access                                            | Grant and check                                              |
| ----------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------ |
| Public visitor                      | Approved public fleet and availability                     | Public response projections; no passenger manifest           |
| Customer                            | Own profile, bookings and payments                         | Session plus record ownership on server                      |
| Boat owner                          | Own submissions, private documents and verification status | Customer session plus owner checks; identity/mobile gates    |
| Admin                               | Operational customer/boat/payment review                   | Individual account, password + MFA, server-side checks       |
| Developer/contractor                | Source and synthetic development data                      | Repository invitation; no production application role needed |
| Deployment operator                 | Required infrastructure/secrets                            | Named cloud/IAM access; separate reviewed elevation          |
| Payment/email/SMS/identity provider | Minimum required workflow data                             | Server-only adapter, separate credentials and contract       |

The application currently has a broad admin role. It does **not** provide separate
read-only support, finance-only or contractor admin roles, SSO, fine-grained custom
roles, or a provider API-key account for arbitrary third parties. Do not give an
admin account to someone who should see only a subset of admin data. Use sanitized
operator-produced evidence or implement/test the required narrower permission
before granting access. Never share admin credentials, browser cookies or API keys.
Document review has independence checks, and refunds require admin approval, but
there is no universal two-admin approval system for every operation.

## Grant, review and revoke

1. Record the purpose, named person, sponsor, exact systems/records needed,
   environment, start/end dates and approved data-sharing terms. Obtain the
   appropriate operator approval before granting real data access.
2. Start with source-only or staging access and synthetic data. Use separate
   GitHub invitations, cloud IAM identities and provider users. Require MFA where
   supported. Grant the minimum role; an Atlas credential is not a customer role.
3. Keep production secrets in a deployment secret manager, injected server-side.
   Use least-privilege database credentials scoped to the intended database and
   approved app-host network rules. Do not allow all Internet IPs as a workaround.
4. Set repository branch protection, reviewed PRs, required CI, dependency/secret
   scanning and cloud access logs. Enable these in the actual accounts; the repo
   cannot enforce organization/IAM policies on its own.
5. Review access on expiry, role change and periodically (for example monthly).
   Remove GitHub/cloud/Atlas/provider access, revoke application sessions, rotate
   any shared credentials the person knew, and record completion. Changing an
   admin password revokes its existing sessions/challenges; coordinate full
   account removal with the operator because there is no admin offboarding UI.
6. If someone exported data, confirm return/deletion according to the agreement,
   including support attachments and local copies. Access removal alone cannot
   erase previously downloaded information.

## Data inventory and minimization

| Data                                     | Why stored/shared                    | Protection and handling                                             |
| ---------------------------------------- | ------------------------------------ | ------------------------------------------------------------------- |
| Name, email, mobile                      | Account, contact and journey notices | Owner-scoped APIs; admin sees operational details                   |
| Password verifier                        | Login                                | Salted scrypt hashes; never return verifier/salt                    |
| Session/reset/OTP state                  | Authentication/recovery              | Hashed tokens, expiry, limits; secure cookies in production         |
| Admin authenticator seed                 | Admin MFA                            | AES-GCM with separate server key; recovery hashes only              |
| Bookings/seats/boat/trip                 | Travel and inventory                 | Shared atomic transactions; explicit response fields                |
| Payment/refund references, amount/status | Verification/reconciliation          | Server evidence; no CVV/full PAN/UPI secrets retained               |
| Boat document files and review metadata  | Safety/authority review              | Authenticated private access, type/size/scanner/review gates        |
| Identity-provider reference/status       | Owner verification                   | Hosted authorized-provider flow; no full Aadhaar collection/storage |
| Notification recipient/content/job       | Booking/recovery/reminders           | Server-side outboxes; minimum content; provider retention applies   |
| Security/operations history              | Incident investigation               | Sanitized events; restricted admin access                           |
| Database backup                          | Disaster recovery                    | Encrypted export, separately escrowed keys and isolated drill       |

Do not add analytics, tracking pixels, third-party scripts or exports without
reviewing necessity, consent/notice, provider terms and the data leaving the app.
The current repository does not implement automated retention/deletion policies,
a customer data export/deletion portal or guaranteed
redaction of arbitrary logs. The operator must define lawful retention periods,
request handling and backup expiry before commercial use. Preserve financial/
legal obligations when honoring erasure requests; do not manually delete referenced
bookings/payment records and break reconciliation.

## Safe provider integrations

Use Razorpay's public checkout key only where its API contract requires it; keep
merchant secrets and webhook secrets server-side. Verify signed raw webhook bodies,
fetch authoritative payment evidence and compare order/amount/INR/status. Never
mark a payment successful from a browser field. Do not retry uncertain money
movement or accepted/unknown SMS sends blindly.

Gmail/TextBee receive recipient information and necessary message text. An identity
bridge must be an authorized provider with a reviewed hosted consent/alternative
flow. Configure a private scanner; uploaded documents are not approval by themselves.
Alert webhooks must use HTTPS and sanitized payloads with stable event IDs. Use
independent credentials per environment and review provider retention/subprocessors.
No third-party service gains database access by default.

## Security review checklist for every change

- Check authorization at each server operation, including direct object lookups,
  document reads, exports, cancellation/refund actions and cross-account history.
- Keep mutations same-origin with the request marker and JSON checks. Provider
  webhooks use their own signature verification instead. Keep body/file limits,
  shared throttles and production Secure/HttpOnly/SameSite cookies.
- Use public response allowlists rather than spreading database rows into JSON.
  Treat admin pages and downloaded boarding passes as personal data too.
- Keep browser persistence to non-sensitive preferences. Never store passwords,
  session/reset tokens, MFA seeds, payment secrets or customer histories there.
- Keep provider calls outside retryable MongoDB transactions. Preserve unique
  request keys, majority writes, idempotency and fenced worker claims.
- Review logs/errors/alerts/fixtures/screenshots for PII and secrets. Sanitize
  locally before sharing; a private repository is not a secret manager.
- Run the contributor checks and authorization/privacy integration tests. Test
  negative paths: another account, missing factor, expired token, bad origin,
  bad webhook, scanner failure and ambiguous provider outcome.

`security:check` rejects tracked private artifact paths and obvious browser/server
boundary violations. It uses conservative text checks and cannot prove the absence
of obfuscated imports, secrets in history, malicious dependencies, SSRF or other
vulnerabilities. Use independent review and dedicated scanning as well.

## Operations, backups and incident response

Use HTTPS ingress, trusted proxy configuration, synchronized clocks, shared secrets
and a single shared database across replicas. Existing headers/CSP and readiness
checks help but do not secure the hosting account. Install dependency updates via
reviewed PRs and rerun checks; do not apply `npm audit fix --force` blindly.

Protect encrypted backups and both recovery/MFA keys separately. Apply off-host
retention and test an actual backup before relying on it. The restore drill uses
a disposable local database with no workers. Production cutover must reconcile
payments and pending jobs, revoke stale tokens and switch all replicas together;
see [the recovery guide](../BACKUP_RESTORE_PILOT.md).

For a suspected leak: restrict the affected access, preserve private evidence,
rotate compromised secrets, revoke sessions, inspect audit/provider/infra logs,
assess affected people and meet applicable notification duties. Follow
[SECURITY.md](../SECURITY.md). Never post the evidence publicly or destroy records
needed to reconcile a payment. The application has no automatic breach-notification
workflow or comprehensive tamper-proof audit service; arrange independent access
logs and monitoring appropriate to the operation.

Customer email proof, held notification delivery, password screening and hashing limits
are detailed in [CREDENTIAL_SECURITY.md](../CREDENTIAL_SECURITY.md).
