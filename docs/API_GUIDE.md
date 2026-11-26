# API orientation for authorized integrations

These are the application's same-origin browser APIs, not a public partner API
with independently scoped service accounts. There is no API-key/Bearer integration
role. Do not distribute admin cookies, scrape customer data or enable wildcard CORS
to connect an external partner. Design, review and test a separately scoped service
contract before adding machine-to-machine access. Read the
[access/privacy guide](ACCESS_PRIVACY_SECURITY.md) first.

## Request contract

The browser client is `src/lib/api.js`; request validation is in `server/app.js`.
Normal state-changing browser requests use JSON, an exact trusted Origin and
`X-Nautica-Request: 1`. `X-Nautica-Language: hi` selects Hindi; English is the default.
The marker is CSRF defense in combination with origin/cookie checks, not a secret
or authentication credential. Production uses HTTPS and HttpOnly cookies; client
JavaScript must never read, copy or persist session tokens.

For example, from the approved same-origin frontend after user sign-in:

```js
const response = await fetch('/api/user/bookings', {
  credentials: 'same-origin',
  headers: { 'X-Nautica-Language': 'en' },
});
if (!response.ok) throw new Error('Unable to load your bookings.');
const history = await response.json();
```

Do not log that response: it can contain personal journey information. Display
only necessary fields. Prefer the existing API wrapper for application changes.

## Endpoint families

| Endpoint/family                                                 | Authorization                                      | Purpose                                                        |
| --------------------------------------------------------------- | -------------------------------------------------- | -------------------------------------------------------------- |
| `GET /api/health`                                               | Public                                             | Application/database readiness, not full provider health       |
| `GET /api/boats`, `/api/availability`                           | Public                                             | Public fleet and current seat availability                     |
| `GET /api/payments/config`                                      | Public                                             | Reviewed public checkout configuration, never merchant secrets |
| `POST /api/user/register`, `/api/user/login`                    | Origin checks and throttling                       | User account/session                                           |
| `POST /api/user/forgot-password`, `/api/user/reset-password`    | Origin checks and token/limit rules                | Enumeration-resistant recovery, then single-use reset          |
| `/api/user/session`, `/api/user/bookings`, `/api/user/payments` | Customer session and ownership                     | Current user's profile/history only                            |
| `/api/user/password`, `/api/user/logout`                        | Customer session and origin checks                 | Password/session management                                    |
| `POST /api/payments/order`, `/api/payments/verify`              | Customer session, ownership and configured gateway | Held seats and provider-verified capture                       |
| `POST /api/bookings`                                            | Customer session; development demo only            | Simulated booking, rejected for production sales               |
| `/api/owner/verification`                                       | Customer session; provider/mobile checks           | Owner verification workflow                                    |
| `/api/owner/boats`                                              | Customer session and owner checks                  | Boat submissions and private documents                         |
| `POST /api/admin/login`                                         | Password and throttling                            | Restricted MFA challenge only                                  |
| `POST /api/admin/mfa/setup`, `/api/admin/mfa/verify`            | Valid short-lived challenge and factor rules       | Enrollment/verification before full session                    |
| Other `/api/admin/*`                                            | Full MFA admin session                             | Fleet review, manifests, refunds, boarding and operations      |
| `POST /api/payments/razorpay/webhook`                           | Raw-body provider signature and evidence checks    | Provider callback; does not use browser origin contract        |

This is a navigation map, not a complete request schema. Read the handler and
feature guide before using a nested endpoint. The exact cancellation/refund and
fleet document payloads are maintained in their feature handlers and tests. Do
not assume that a customer-facing booking/pass object is a trusted write payload.

## Failure and retry rules

Handle 400/413 as invalid or oversized input; 401/403 as missing/invalid access or
failed request verification; 404 without revealing another account's record;
409 as a business conflict requiring refreshed state; 429 with bounded backoff;
and 5xx as potentially unavailable/uncertain. Do not expose internal diagnostics
or tell users to change deployment secrets. Errors must remain safe regardless
of whether the caller is signed in.

Seat availability can change between reads. Recheck by submitting through the
normal transactional workflow. Retrying the same idempotency/request key is
different from creating a new booking/payment attempt. After a timeout, inspect
owned history and provider reconciliation; never automatically charge or refund
again. Signed provider callbacks must be idempotent. Notification acceptance is
not proof of inbox/handset delivery.

When extending an endpoint, update its allowlisted response, shared validation,
authorization/negative tests, both UI languages and feature documentation. Do not
return raw database rows or provider payloads, even to admins.

## Checkout recovery and seat states

`GET /api/payments/status?requestKey=<UUID>` is customer-authenticated and
ownership-scoped. It returns safe stored status, `serverNow`, optional hold
`expires`, and a projected `booking` only when that customer owns the associated
record. It never initiates provider calls or a new charge. Unknown/unowned keys
have the same `not_found` response; absence alone is not evidence that no money
moved. See [checkout recovery](../CHECKOUT_EXPERIENCE.md).

Availability additionally distinguishes `heldSeats` from `confirmedSeats`, while
`bookedSeats` remains their union for existing clients. No per-seat customer or
attempt identifiers are public.
