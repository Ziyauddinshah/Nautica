## User effect

Describe the problem and resulting behavior.

## Access and data impact

Describe changed roles, data fields, response projections, external providers,
exports, migrations and failure/retry behavior. State explicitly when none apply.
Do not include personal records, secrets, cookies or provider payloads.

## Validation

Record relevant check results and limitations. Include formatting/docs/boundary
checks and meaningful security/financial regression tests when affected. Synthetic
provider results do not prove live delivery or settlement.

## Reviewer checks

- Confirm server-side ownership/MFA checks and minimum necessary data exposure.
- Confirm no credentials, private backups or personal-data fixtures were added.
- Confirm safe transaction/idempotency/reconciliation behavior where affected.
- Confirm guides and English/Hindi customer-facing text match the implementation.
