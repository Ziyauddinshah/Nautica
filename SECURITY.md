# Security reporting and maintenance

Report suspected vulnerabilities privately to the repository owner through an
existing trusted contact or GitHub private vulnerability reporting **if enabled**.
No dedicated security mailbox or response-time SLA is published here. The owner
must establish a monitored reporting channel before commercial launch. Do not
open a public issue containing customer information, credentials or exploit details.

Send the affected release/commit, component, minimal reproduction using synthetic
data, expected/observed behavior and impact. Never send a real `.env`, database
dump, reset link, cookie, Aadhaar information or private document. Obtain permission
before testing a deployed system. Do not send test payments, SMS or email to real
customers or attempt destructive exploitation.

The maintained web runtime uses MongoDB; SQLite modules are migration/test fixtures.
A private report must distinguish an isolated fixture from a reachable production
path. Review fixes against the affected runtime and regression tests before rollout.

The maintainer should acknowledge privately, assess impact and access, prepare a
fix and relevant tests, coordinate disclosure, and record deployment/credential
rotation steps. For an active incident, contain access first while preserving
private evidence and financial reconciliation. Follow the access/privacy guide for
revocation, notification assessment and recovery. No single in-process alert system
can report an outage when every application instance is stopped.

See [privacy/access controls](docs/ACCESS_PRIVACY_SECURITY.md),
[admin MFA and operations](ADMIN_SECURITY_OPERATIONS.md), and
[backup restoration](BACKUP_RESTORE_PILOT.md). These describe controls and known
limits; they are not a security audit or certification.
