# Admin two-factor authentication and operational alerts

## Configure and enroll admins

Every MongoDB-backed admin login now requires a password **and** an authenticator-app code or a single-use recovery code. No password-only full admin session is issued. Existing password-only sessions are rejected immediately by the new code.

1. Generate a private random encryption key locally:

   ```
   node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
   ```

2. Put the resulting **64 hexadecimal characters** in server-side `ADMIN_MFA_ENCRYPTION_KEY`. Use the exact same key on every app replica and trusted admin CLI host. Do not commit it, put it in `VITE_*`, paste it in chat, or send it in alerts. Back it up separately from the database in your secret-management system.
3. Upgrade/restart all replicas together. Old versions lack MFA enforcement; do not leave them serving admin traffic.
4. For an **existing pre-MFA admin**, run `npm run admin:mfa:reset` in a trusted interactive server terminal. Enter the target account, its current password and the requested username confirmation. This explicitly authorizes new enrollment and revokes its old sessions/challenges/recovery codes. A password login alone cannot authorize enrollment for an unconfigured legacy account.
5. Sign in at `/admin`, scan the locally rendered QR using an authenticator such as Google Authenticator, Microsoft Authenticator or another compatible TOTP app, and submit its current code. No Android SDK is needed. Newly created accounts from `npm run admin:create` are authorized for first enrollment by that trusted CLI action.
6. Save the eight recovery codes privately offline and confirm that you saved them before entering the dashboard. Codes are shown once, are never emailed or saved to browser storage, and each works only once.

Authenticator setup uses RFC-compatible SHA-1 TOTP, six digits and a 30-second period, with a one-step clock window. Synchronize server and authenticator clocks. Accepted counters are consumed globally in MongoDB, so a code cannot be replayed through another app replica or challenge. Wait for a fresh code if the previous one was just used.

The password stage grants only a five-minute, HttpOnly, SameSite-restricted challenge cookie. This cookie cannot access bookings, documents, refunds, operations or other admin APIs. Five wrong factor attempts lock that challenge; shared IP/account limits additionally restrict new challenges and verification attempts. Enrollment, factor use, failures and recovery actions produce private security events without passwords, OTPs, setup keys or plaintext recovery codes.

TOTP secrets and pending setup seeds are AES-256-GCM encrypted with account-bound associated data. Recovery codes contain 128 random bits and only contextual SHA-256 hashes are stored. Successful enrollment invalidates legacy sessions. Password changes preserve configured MFA but revoke existing sessions and in-flight challenges through account versions. Normal verified admin sessions retain the existing eight-hour lifetime and require MFA at every new sign-in.

## Recovery and key management

If the authenticator is unavailable, sign in with the admin password followed by an unused recovery code. In **Admin account security**, replace recovery codes using the password plus a fresh authenticator/recovery code. Replacement invalidates all older recovery codes immediately; save the replacement set before leaving the page.

If both the authenticator and recovery codes are unavailable, use `npm run admin:mfa:reset` from a trusted interactive server terminal. There is deliberately no web endpoint that disables MFA or issues a new seed using only a password. The reset authorizes a new enrollment; it does not grant password-only access. Protect console access and verify the human requesting recovery under your operational policy.

The encryption key is separate from a user's authenticator/recovery codes. Missing, wrong or lost server keys fail closed, including existing admin sessions. Do not casually replace the key on one replica. Planned rotation needs a controlled server-side re-encryption procedure using the previous key, consistent deployment and session handling; this release does not automate rotation. If the old key is irretrievably lost, restore it from its protected backup or authorize new enrollment for affected admins via the console using a new shared key.

`npm run production:check` now requires the key, at least one admin and completed MFA enrollment for all admins, in addition to the existing launch prerequisites. The legacy SQLite adapter remains an isolated-test/migration fixture; the running application uses MongoDB and has no password-only runtime fallback.

## Operational dashboard

Use `/admin/operations` after full MFA authentication. The dashboard shows active/all incidents, affected-record counts, app aliases, history and acknowledgement ownership. An acknowledgement does **not** mark a failing service healthy. After correcting a delivery problem, use **Retry failed alert delivery** to requeue failed alert emails/webhooks and definite SMS rejections; accepted/uncertain SMS sends are never requeued by that action. Conditions resolve only when their next check recovers; reopening creates a new episode and notifications. A routine unchanged observation does not invalidate an acknowledgement revision.

The minute-by-minute monitor checks:

- Captured payments without bookings requiring reconciliation.
- Failed, uncertain and manual-review refunds, plus refunds pending over seven days.
- Repeated provider-confirmed failed payment attempts (five observations in fifteen minutes). Failure webhooks are fetched from Razorpay and deduplicated; they never overwrite captured payments or cancel active checkout orders.
- Failed/unknown email or SMS jobs and notification backlogs older than fifteen minutes.
- Incomplete/unavailable admin MFA, repeated real password/factor failures and recent recovery-code use.
- Observed Razorpay, identity-provider, SMTP, TextBee and document-scanner failures.
- App-monitor heartbeats absent for more than five minutes.
- Failed operational-alert delivery, without recursively enqueueing more alerts about that delivery failure.

Provider health is based on actual service calls, not paid/PII-bearing verification probes. An intentionally unconfigured identity provider is not falsely presented as live verification. A provider incident remains open until a successful observation. Existing booking, refund and notification states remain authoritative; monitoring does not retry uncertain money movements, bypass KYC or resend accepted SMS messages.

Every replica may monitor safely. Incident state/history and deterministic per-episode notification jobs are stored in shared MongoDB. Provider/key health is scoped to the observing app alias, so a healthy peer cannot hide a bad replica's configuration. Set `OPERATIONS_ALERT_LANGUAGE=hi` for Hindi notices (English is the default). Standard email/SMS alerts reuse private `SMTP_ADMIN_TO` and `SMS_ADMIN_TO`. They exclude customer identities, contact details, payment references, document contents, database addresses and credentials. Detailed case review stays inside the authenticated admin screens.

Use a distinct, non-sensitive `OPS_APPLICATION_ID` for staging and production when sharing a receiver or cloning backups. Durable alert IDs otherwise use a hash of the initialized database identity, so independent databases do not suppress each other’s events. Use a stable, non-sensitive unique `OPS_INSTANCE_ID` for each replica, such as `app-1` and `app-2`. Otherwise the app uses a hash of the hostname, never the raw hostname. When intentionally removing an old instance, retire it from the dashboard after it has stopped reporting for five minutes. A renewed heartbeat automatically makes it active again. Retiring an instance is audited and cannot retire a freshly reporting instance.

## Alerts when MongoDB is unavailable

A database failure cannot reliably be recorded or delivered through a database-backed queue. The running monitor therefore sends a sanitized outage event directly through an optional independent webhook and, when configured, Gmail SMTP to the existing private admin recipient. MongoDB remains required for user/admin access and financial operations; there is no local user-data fallback.

Outage notifications are attempted on detection and at fifteen-minute intervals per app instance. An owner-only local temporary directory stores opaque email-attempt hashes, not account or booking data, to throttle SMTP attempts across process restarts. Entries are removed after two days. Containers with recreated/ephemeral filesystems can lose this cache; SMTP is best effort and does not guarantee inbox deduplication. Recovery history/notifications are written when storage returns. An outage that spans a process restart may have only independent-channel history until monitoring recovers.

For independent webhook delivery, configure privately:

```
OPERATIONS_WEBHOOK_URL=https://your-monitor.example/events
OPERATIONS_WEBHOOK_KEY=<optional private Bearer key, at least 32 characters>
```

The endpoint must use HTTPS, with no URL credentials/query/fragment; HTTP redirects are rejected. It receives sanitized JSON containing `eventId`, `incidentId`, `code`, `severity`, `state`, timestamp, and optional count/app alias. The same event ID is sent in `Idempotency-Key`; the receiver **must deduplicate** it and use episode/timestamp ordering to ignore late, obsolete events. This is a documented generic receiver contract, not an automatic integration with a vendor-specific Slack/PagerDuty API. Adapt the receiver if using such a service. URLs/keys never go to the browser or alert payload.

When MongoDB is healthy, webhook jobs are durable with bounded retries and fenced claims. SMTP remains at-least-once at its external acknowledgement boundary, and TextBee acceptance is not proof of handset delivery. Alert-delivery failure is shown on the dashboard; do not assume an email/SMS reached someone merely because a job was queued.

**Also configure an independent uptime monitor outside this application** against `PUBLIC_ORIGIN/api/health`. In-process code cannot detect or notify when every process/host is stopped, the event loop is frozen, or all outbound alert channels fail. The health endpoint tests HTTP/app/database reachability; it does not prove every payment/verification provider healthy. External monitoring is required to cover those failure modes and cold-start failures where the app cannot run. A cold-start database error attempts the independent channels without logging the connection string.

## Deployment and testing

All live instances need the same database, MFA key and webhook/email settings, with distinct stable app aliases. No database reset or repeat SQLite migration is needed; startup creates indexes for challenges, security events, incident state/history, service observations, heartbeats, webhook jobs and failed-payment observations. Back up encrypted admin records and the separately protected encryption key, and test restoration in an isolated environment.

Subscribe Razorpay to `payment.failed` in addition to the existing captured/order/refund webhook events. Test MFA enrollment, recovery, console reset, expired/replayed codes, operations acknowledgements, multi-server deduplication, database partitions and independent alert delivery in staging. Automated tests use isolated databases and fake providers; they do not change production admin enrollment or send live alerts.
