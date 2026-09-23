# Testing strategy

## Purpose

This document defines the planned verification layers for the flash-sale system.

No test has run in design increment 0.

## Flow

Vitest will verify pure rules and service boundaries.

Integration tests will run against MongoDB, Valkey, and LocalStack where its services support the required behavior. Deployment-shaped checkout tests will cover CloudFront, API Gateway REST API, and Lambda when that path exists.

Playwright will verify the browser purchase flow.

k6 will measure throughput, latency, and failure behavior.

Each layer will report its evidence before the related increment is complete.

## Decisions & assumptions

- Tests will use TypeScript and the repository pnpm workflow.
- Integration tests will use real MongoDB, Valkey, and LocalStack services.
- LocalStack will cover Lambda and SQS behavior that the local environment supports.
- Checkout uses an API Gateway REST REQUEST Lambda authorizer that checks the Better Auth session with Better Auth semantics.
- Better Auth stores users and credentials in MongoDB and sessions in Valkey secondary storage. Keep `session.storeSessionInDatabase` unset or `false` to prevent MongoDB fallback.
- The authorizer checks cookie integrity and expiry with `getSession` options `disableRefresh: true` and `disableCookieCache: true`. It does not refresh an active session and does not call Express or MongoDB. Better Auth may delete an expired session and return an expiry cookie.
- A missing session or Valkey error denies checkout. Valkey loss removes active sessions and requires a new login after recovery.
- Checkout uses only the active `customerId`, not the Better Auth user snapshot. Privileged Express routes read current roles from MongoDB or invalidate sessions after role changes.
- Separate auth and inventory key namespaces in Valkey. Both authorizer and checkout Lambda require Valkey network access; deployment and local network setup remain future implementation choices.
- The authorizer checks an exact allowlist of storefront origins for cookie-authenticated checkout POST requests.
- Test data will use one listing with controlled stock and unique customer identities.
- Listing setup validates integer `stockTotal` and `reserveSlots` values, requires `stockTotal > 0`, and enforces `0 <= reserveSlots <= stockTotal`. It derives `publicStock = stockTotal - reserveSlots`.
- Examples verify `stockTotal: 15, reserveSlots: 5, publicStock: 10` and `stockTotal: 10, reserveSlots: 2, publicStock: 8`.
- Stress results will describe the test environment, load profile, duration, throughput, latency percentiles, errors, and invariant results.
- This document contains no invented benchmark result.

## Unit tests with Vitest

Unit tests will cover:

- Sale window state at before, start, inside, end, and after boundaries.
- Idempotency key validation and stable result mapping.
- Idempotency bindings use `(listingId, trusted customerId, client idempotencyKey)`.
- One-item-per-user decision rules.
- Event schema validation.
- Duplicate and reorder handling for at-least-once Standard SQS delivery.
- MongoDB order state transitions.
- The first valid provider outcome is immutable after it matches the SQS binding; a later conflicting event cannot change it.
- Unified reconciliation for reservation and payment facts.
- Legal terminal transitions for `COMPLETE` and `CANCELLED`.
- Exact-once slot release markers and Valkey release decisions.
- Concurrent payment-success and payment-failure terminal races.
- The first valid correlated provider outcome wins under concurrent conflicting callbacks.
- MongoDB assigns a per-order receive sequence to new authenticated provider events. Callback insertion, SQS binding persistence, reconciliation, and terminal transitions serialize through the same per-order record. Each terminal transition chooses the lowest-sequence committed event that matches the binding, not a provider-supplied timestamp.
- A duplicate `providerEventId` does not get a new receive sequence or change the selected outcome.
- Same-tuple retries reuse `orderId` and `paymentSessionId` stored in the atomic Valkey claim before SQS publication.
- Payment-first stubs with partial-index behavior.
- Immutable mock-session `customerId` owner checks after the SQS worker stores the binding.
- The mock payment page keeps outcome buttons disabled until the SQS worker persists the binding and Express checks the owner. A quarantined callback does not block the buttons when the order remains `AWAITING_FACTS` and has no valid outcome.
- A payment-first provider callback stores a pending payment fact and event marker, leaves the order `AWAITING_FACTS`, and creates no release intent.
- SQS supplies the immutable order/customer/listing/reservation/slot/payment-session binding. Reconciliation validates callback correlation before it accepts the first outcome.
- A callback that does not match the SQS binding is quarantined and cannot terminalize the order.
- A failure or expiry becomes `CANCELLED` only after both facts exist; the release intent then commits with the terminal transition.
- MongoDB rejection of duplicate active customer ownership with the partial `$in` index.
- Release crashes before and after the Valkey side effect.
- A crash after provider-event marker creation and before payment-fact or state commit.
- Release intents are created only when the cancellation transaction commits.
- The release worker retries a pending intent without adding a slot twice.
- Service authentication on the provider-shaped mock callback route.
- Event-driven reconciliation of reservation and payment facts.

Unit tests will use deterministic clocks and generated identifiers.

## Integration tests

Integration tests will use MongoDB, Valkey, and LocalStack for supported Lambda and SQS behavior. LocalStack results do not prove deployed CloudFront forwarding or API Gateway authorizer behavior.

They will cover:

- Listing creation, `listing-slot` creation, Valkey seed, and publication verification.
- Seed exactly `stockTotal` unique slot IDs into one Valkey pool, including all `reserveSlots`; reject publication when the seed is incomplete.
- Concurrent claims from the shared pool never assign one slot twice, including when requests consume advertised public stock and reserve slots.
- Reject sold-out checkout only when the atomic Valkey claim finds no slot. A cancellation returns one slot to the same pool through the guarded release.
- Verify no more than `stockTotal` orders can reach `COMPLETE`; do not use `publicStock` as the physical completion limit.
- With an active listing set to `stockTotal: 10`, `reserveSlots: 2`, and `publicStock: 8`, verify that ten distinct authenticated customers can claim and complete orders, including customers 9 and 10 through the hidden allowance. With the sale still active and no cancellations, verify that an 11th distinct authenticated customer with a fresh idempotency key receives a sold-out result.
- The deployment-shaped checkout request passes from CloudFront through API Gateway REST API to Lambda without an Express purchase proxy.
- The authorizer accepts a valid session and rejects invalid, expired, revoked, and missing Valkey sessions before checkout Lambda runs.
- A missing or unapproved `Origin` causes rejection before any Valkey read and before checkout Lambda invocation.
- A Valkey outage denies checkout. The authorizer does not fall back to MongoDB or call Express.
- Instrument authorizer execution to confirm the session check makes no Express or MongoDB request. SQS is the only Lambda-to-Express bridge.
- An authorizer check does not refresh an active session or use Better Auth cookie cache. Expired-session cleanup may delete Valkey session state and create an expiry cookie internally; API Gateway does not forward that cookie.
- The SQS worker persists the immutable mock-session binding. A same-key retry reuses the IDs stored in the Valkey reservation.
- A cross-site checkout request fails even when CORS or cookie `SameSite` settings would otherwise allow it.
- Browser-supplied `customerId` values cannot replace the authorizer identity.
- A user role change does not grant a stale Valkey user snapshot access to a privileged Express route when the route uses current MongoDB roles or session invalidation.
- Purchase rejection before start, after end, and for an unpublished listing.
- Atomic slot reservation under concurrent requests.
- Duplicate customer requests and duplicate idempotency keys.
- The same `(listingId, trusted customerId, client idempotencyKey)` returns the same `orderId` and payment session while Valkey retains its state.
- Two customers who submit the same client key for the same listing receive separate bindings; neither can read the other's order or session.
- One customer who uses the same client key for two listings receives separate bindings.
- A new idempotency key is rejected after a completed purchase.
- A new idempotency key succeeds after a failed or expired payment releases the old slot.
- The cancelled attempt remains stable for its original `(listingId, trusted customerId, client idempotencyKey)` tuple.
- SQS publication failure followed by a best-effort retry with the same tuple while Valkey state remains intact; verify that the retry does not reserve a second slot.
- Duplicate and out-of-order Standard SQS deliveries.
- SQS then payment event delivery.
- Payment then SQS event delivery.
- Duplicate SQS delivery.
- Duplicate payment callback delivery.
- Conflicting success and failure or expiry callbacks in both arrival orders.
- Success before SQS followed by SQS; verify the order stays `AWAITING_FACTS` until binding correlation succeeds, then becomes `COMPLETE` with no release intent.
- Failure or expiry before SQS; verify the order stays `AWAITING_FACTS`, holds the slot, and has no release intent.
- SQS after payment-first failure; verify a matching binding changes the order to `CANCELLED` and creates one release intent.
- SQS after a mismatched payment-first callback; verify the callback is quarantined and no terminal state or release intent is created.
- Two pending callbacks arrive before SQS; verify reconciliation accepts the first matching callback by MongoDB receive sequence and quarantines earlier mismatches.
- A callback commits after SQS binding persistence but before pending-event reconciliation; verify reconciliation selects the lowest-sequence committed matching event.
- A callback insertion races with a terminal transition; verify per-order serialization and transaction retry prevent a later event from bypassing an earlier committed matching event.
- SQS persists a binding after an early callback mismatch; verify the mismatch is quarantined and the owner-checked mock buttons appear while the order remains `AWAITING_FACTS` with no valid outcome.
- Payment failure or expiry before SQS delivery.
- Payment success before SQS delivery.
- A Lambda crash after the Valkey pop and before SQS publication; verify that no durable replay exists and that checkout fails closed when ownership is unclear.
- A same-key request after that crash while Valkey state remains; verify that it can retry best effort without reserving a second slot.
- A same-key request after Valkey loses the reservation state; verify that checkout fails closed and does not claim a replay guarantee.
- A Lambda crash after SQS publication; verify that a same-key retry reuses the order and payment-session IDs stored in the Valkey binding.
- A repeated slot-release operation.
- A crash after the cancellation transaction commits but before the release worker runs; verify that the pending intent remains and the worker releases the slot after restart.
- A crash after Valkey releases the slot but before MongoDB marks the intent complete; verify that a retry does not add the slot twice.
- A retry finds an applied Valkey release marker after a new reservation owns the slot; verify it marks the old intent complete without clearing or releasing the new owner.
- The Valkey release script finds a newer owner while MongoDB still shows the old owner; verify it denies release and keeps the intent pending.
- A retry finds no applied marker and MongoDB shows a newer or secured owner; verify it leaves the old intent pending for manual reconciliation.
- A fresh intent initializes a Valkey `not_applied` marker before its first release call. A retry proceeds only when that marker proves no release happened.
- A retry finds no marker after `releaseAttemptStarted=true`; verify it treats state as unknown and leaves the intent pending.
- A retry finds an expired or unavailable Valkey operation marker; verify it leaves the intent pending and does not release the slot.
- A crash after MongoDB records this operation's owner clear but before Valkey release; verify a retry continues only while no newer owner exists.
- Release crashes before and after the Valkey release side effect.
- Release crash after MongoDB owner clear and before the Valkey release side effect.
- An old release retry after the slot is allocated to a newer reservation.
- A cancelled release does not clear a newer slot owner or a secured/completed slot.
- A callback retry after a rolled-back provider-event transaction.
- Full Valkey state loss after a pop and before SQS closes checkout; MongoDB facts do not rebuild ambiguous inventory.
- A delayed SQS event does not reopen a cancelled order or change slot ownership.
- MongoDB persistence before SQS acknowledgement.
- Guarded compensation release after payment failure or expiry.
- Express release worker polling and retrying pending release intents.
- Express SQS worker long-polling against the LocalStack queue.
- Customer and administrator access boundaries for Better Auth email/password sessions.
- A different authenticated customer cannot read or change a mock payment session.

## End-to-end tests with Playwright

Playwright will verify the customer-visible path:

1. A customer signs in.
2. The storefront shows the sale state.
3. The customer submits one purchase.
4. The UI handles an accepted or retryable result.
5. The customer retries with the same idempotency key when required.
6. The mock payment page displays success and failure buttons.
7. The page sends an owner-checked mock outcome, which Express translates into the callback handler.
8. The UI shows the durable purchase result.
9. A second purchase is rejected.
10. After a failed payment, the page keeps its controls disabled until the SQS-backed binding exists. The original key returns `CANCELLED` after matching payment and reservation facts exist, and a new key starts checkout after release completes.

The tests will also verify that one customer cannot read another customer result.

The tests will verify that an unauthenticated or non-owner browser cannot use the mock outcome route.

Deployment checks will verify that the checkout hostname is within the Better Auth cookie scope, CloudFront forwards the session cookie and `Origin`, the authorizer passes trusted `customerId`, authorizer-result caching is disabled, and checkout responses are not cached. They will also check `SameSite`, origin-request forwarding, and exact-origin allowlist configuration. If origins differ, verify `credentials: 'include'`, exact-origin `Access-Control-Allow-Origin`, and `Access-Control-Allow-Credentials: true` on successful POST and relevant error responses. Verify that CloudFront allows and forwards `OPTIONS` and preflight headers. Verify that unauthenticated `OPTIONS` returns exact-origin credentialed CORS headers and required methods and headers without the POST authorizer or checkout invocation. LocalStack does not prove these CloudFront and deployed API Gateway properties.

The tests will verify that the mock outcome route is disabled outside local and test environments.

The tests will verify that a browser cannot call the service-authenticated provider callback route.

The tests will verify that an authenticated service can call the provider callback route and that the mock outcome route uses the server-side session binding.

## Stress tests with k6

k6 will test these scenarios:

- Many unique customers submit concurrent checkout requests.
- Many users compete for fewer slots than requests.
- Many repeated attempts reuse the same idempotency tuple for each customer and listing.
- Requests arrive before, during, and after the sale window.
- SQS and payment callbacks arrive in both orders.
- SQS and payment callbacks repeat.
- The load includes failure and expiry callbacks before SQS.
- Valkey, SQS, or MongoDB has controlled short failures.
- A Lambda crash or Valkey loss after the pop and before SQS has no durable replay guarantee. Checkout fails closed when the slot owner is unclear.

The test report will state the load profile and the environment before it states results.

## Invariants and acceptance criteria

The following checks are measurable and apply to every runtime increment:

| Invariant | Acceptance check |
| --- | --- |
| Public count | At publication, `publicStock` equals `stockTotal - reserveSlots`; for example, 15 and 5 gives 10, and 10 and 2 gives 8. |
| Physical inventory | The Valkey pool contains all `stockTotal` slots, and each slot has at most one active claim. |
| No overselling | Completed orders for one listing are less than or equal to `stockTotal`. |
| One completed order per customer and listing | At most one `COMPLETE` order exists for each `(listingId, customerId)` pair. Cancelled attempts do not block a new checkout. |
| One active customer ownership | The partial MongoDB index rejects a second `AWAITING_FACTS` or `COMPLETE` order after `customerId` exists. |
| One slot owner | At most one order or reservation owns a `(listingId, slotId)` pair. |
| Idempotency | Repeating `(listingId, trusted customerId, client idempotencyKey)` while Valkey retains its state uses one reservation and `orderId`. Another customer or listing cannot reuse the binding. A new key is required after cancellation. |
| Sale window | No request outside the active window creates a reservation. |
| Durable persistence | Every acknowledged event has one matching MongoDB order fact record. |
| Duplicate safety | Replaying an SQS event or payment callback does not increase order count or release count. |
| Reorder safety | Reordered events do not move an order to an older state. |
| Terminal safety | A delayed SQS event does not reopen `CANCELLED`, and a delayed failure does not cancel `COMPLETE`. |
| Payment outcome | The first provider outcome that matches the immutable SQS binding wins. Mismatched callbacks are quarantined. Later conflicting callbacks do not change the order or create another release. |
| Callback order | MongoDB assigns each new authenticated provider event a per-order receive sequence. Callback insertion, binding persistence, reconciliation, and terminal transitions serialize per order. Each terminal transition chooses the lowest-sequence committed matching event and ignores provider-supplied timestamps. |
| Release exactly once | A failure or expiry adds one slot at most once, after both facts exist and slot ownership is validated. |
| Durable release intent | A payment-first callback fact and event marker can commit while the order remains `AWAITING_FACTS`. After binding validation, `CANCELLED` and its pending release intent commit in one MongoDB transaction. The release worker retries pending intents until completion. |
| Callback access | Only an authenticated service can call the provider-shaped callback route. A browser can submit a mock outcome only for its own order in local or test mode. |
| Release ownership | An old release cannot clear a newer `currentReservationId`, customer claim, or `orderId`. |
| Release retry | The worker checks the Valkey operation marker first. An applied marker completes the old intent without changing a newer owner. A missing/expired marker with newer ownership keeps the intent pending for manual reconciliation. |
| Valkey-to-SQS gap | A crash or Valkey loss after the pop and before SQS has no durable replay guarantee. Checkout fails closed when ownership is unclear. |
| Stress evidence | Each run reports requests per second, p50, p95, p99, error rate, duration, and invariant results. |

This increment has no measured values.

Future increments will define service-level targets after the local baseline and deployment shape are known.

## Expected results

The expected result for this increment is documented scope, not runtime output.

Later increments must attach test output to the worktree review.

## Change log

### 2026-09-22

- Added the planned unit, integration, browser, and stress-test strategy.
- Added payment event-order permutations, terminal-state checks, and exact-once release criteria.
- Added payment-session crash recovery, partial-index stubs, terminal races, and release crash checks.
- Added provider-event marker transaction crash and retry coverage.

### 2026-09-23

- Added cancelled-payment retry, owner-reuse, fail-closed Valkey-loss, and customer/admin access tests.
- Added pending payment-first callback and delayed release coverage.
- Added immutable mock-session owner coverage.
- Added loss-between-pop-and-publish, closed-sale same-key retry, late-event, and manual-recovery coverage.
- Replaced durable replay and operator-recovery claims with the known pop-to-SQS gap and best-effort retry checks.
- Added conflicting callback, durable release intent, worker retry, and provider route authentication coverage.
- Added CloudFront-to-API-Gateway checkout routing, session-authorizer, and cache-forwarding coverage.
- Added Valkey-backed session checks, fail-closed outage behavior, active-session refresh checks, and explicit deployment-only validation boundaries.
- Added cookie-scope, credentialed CORS, and unauthenticated preflight checks for cross-origin deployment.
- Added an assertion that Origin rejection makes no Valkey read and invokes no checkout Lambda.
- Added callback serialization races and mock-button recovery after a quarantined callback.
- Added count validation, public-count examples, shared-pool concurrency, release, and completion-limit checks.
