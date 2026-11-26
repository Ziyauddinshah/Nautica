# Working on Nautica

Start with [README.md](README.md), then [the developer guide](docs/DEVELOPER_GUIDE.md).
Use Node 24 and `npm ci`. Keep development data separate from production and use
fake provider transports in automated tests. A new contributor needs source-code
access, not production credentials or a copy of customer records.

Read [the access and privacy guide](docs/ACCESS_PRIVACY_SECURITY.md) before granting
access, handling a customer record or connecting an external service. See
[SECURITY.md](SECURITY.md) for private vulnerability reporting and incident handling.
Every source file has a purpose comment; [the file reference](docs/FILE_REFERENCE.md)
explains where each tracked file fits.

Before submitting changes:

```sh
npm run docs:generate
npm run format
npm run format:check
npm run docs:check
npm run security:check
npm test
npm run test:mongodb
npm run test:recovery
npm run build
```

MongoDB integration tests start isolated local replica sets and may download a
MongoDB binary the first time. Set `MONGOMS_DOWNLOAD_DIR` or
`MONGOMS_SYSTEM_BINARY` to an approved cached location when needed. Never disable
TLS verification to fix a download. Tests must not call real payment, email, SMS
or identity services. Live verification commands are documented separately and
must be run against the intended environment by its operator.

Keep a change focused. Explain its user effect, permissions, changed data fields,
provider effects, failure behavior and validation. Add meaningful tests for changed
security or financial behavior. Ask a second reviewer to inspect changes to auth,
response projections, document access, inventory transactions, payment/refund
coordination, exports and provider callbacks. Repository branch protection and
reviewer requirements must be enabled by its GitHub administrator; this document
and the CI workflow do not enforce a two-person rule by themselves.

Use descriptive names and small functions. Comments explain trust boundaries,
why a retry is safe, and why a check belongs before a write. Avoid explaining
obvious syntax or storing historical code in comments. Keep customer-facing text
in the English/Hindi catalog. Keep secrets out of comments, screenshots and test
fixtures. Update the relevant guide when behavior or environment settings change.

The formatter owns layout. Avoid combining behavior changes with a broad rename
or redesign. Do not bypass required checks, weaken majority writes, replace
server-side authorization with hidden UI controls, or grant admin access to solve
a development setup problem. Discuss a necessary architectural change with the
maintainer and document its consequences.

Before sharing code commercially, confirm the project's licensing and contract
terms with its owner. Source access is not a grant of rights to customer data,
merchant accounts or third-party provider credentials.
