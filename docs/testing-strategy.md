# Testing strategy

## Purpose

This document defines the planned verification layers for the flash-sale system.

No test has run in design increment 0.

## Flow

Vitest will verify pure rules and service boundaries.

Integration tests will run against MongoDB, Valkey, and LocalStack.

Playwright will verify the browser purchase flow.

k6 will measure throughput, latency, and failure behavior.

Each layer will report its evidence before the related increment is complete.

## Decisions & assumptions

- Tests will use TypeScript and the repository pnpm workflow.
- Integration tests will use real MongoDB, Valkey, and LocalStack services.
- LocalStack will cover Lambda and SQS behavior that the local environment supports.
- Test data will use one listing with controlled stock and unique customer identities.
- Stress results will describe the test environment, load profile, duration, throughput, latency percentiles, errors, and invariant results.
- This document contains no invented benchmark result.

## Unit tests with Vitest

Unit tests will cover:

- Sale window state at before, start, inside, end, and after boundaries.
- Idempotency key validation and stable result mapping.
- One-item-per-user decision rules.
- Event schema validation.
- Duplicate and reorder handling for at-least-once Standard SQS delivery.
- MongoDB order state transitions.
- The first valid provider outcome is immutable; a later conflicting event cannot change it.
- Unified reconciliation for reservation and payment facts.
- Legal terminal transitions for `COMPLETE` and `CANCELLED`.
- Exact-once slot release markers and Valkey release decisions.
- Concurrent payment-success and payment-failure terminal races.
- The first valid provider outcome wins under concurrent conflicting callbacks.
- Idempotent payment-session creation on a same-key retry after SQS publication.
- Payment-first stubs with partial-index behavior.
- Immutable mock-session `customerId` owner checks before SQS.
- MongoDB rejection of duplicate active customer ownership with the partial `$in` index.
- Release crashes before and after the Valkey side effect.
- A crash after provider-event marker creation and before payment-fact or state commit.
- Release intents are created only when the cancellation transaction commits.
- The release worker retries a pending intent without adding a slot twice.
- Service authentication on the provider-shaped mock callback route.
- Event-driven reconciliation of reservation and payment facts.

Unit tests will use deterministic clocks and generated identifiers.

## Integration tests

Integration tests will use MongoDB, Valkey, and LocalStack.

They will cover:

- Listing creation, `listing-slot` creation, Valkey seed, and publication verification.
- Purchase rejection before start, after end, and for an unpublished listing.
- Atomic slot reservation under concurrent requests.
- Duplicate customer requests and duplicate idempotency keys.
- The same idempotency key returns the same `orderId` and payment session while Valkey retains its state.
- A new idempotency key is rejected after a completed purchase.
- A new idempotency key succeeds after a failed or expired payment releases the old slot.
- The cancelled attempt remains stable for its original idempotency key.
- SQS publication failure followed by a best-effort retry with the same key while Valkey state remains intact; verify that the retry does not reserve a second slot.
- Duplicate and out-of-order Standard SQS deliveries.
- SQS then payment event delivery.
- Payment then SQS event delivery.
- Duplicate SQS delivery.
- Duplicate payment callback delivery.
- Conflicting success and failure or expiry callbacks in both arrival orders.
- Success before SQS followed by expiry; verify `PAYMENT_PENDING` stays tied to success, then becomes `COMPLETE` after SQS, with no release intent.
- Failure or expiry before SQS followed by success; verify `CANCELLED` stays terminal and the release intent completes once.
- Payment failure or expiry before SQS delivery.
- Payment-first failure releases the Valkey slot when MongoDB has no durable slot owner.
- Payment success before SQS delivery.
- A Lambda crash after the Valkey pop and before SQS publication; verify that no durable replay exists and that checkout fails closed when ownership is unclear.
- A same-key request after that crash while Valkey state remains; verify that it can retry best effort without reserving a second slot.
- A same-key request after Valkey loses the reservation state; verify that checkout fails closed and does not claim a replay guarantee.
- A Lambda crash after SQS publication and before payment-session creation; verify that a same-key retry can reuse the order and session binding while required state remains available.
- A repeated slot-release operation.
- A crash after the cancellation transaction commits but before the release worker runs; verify that the pending intent remains and the worker releases the slot after restart.
- A crash after Valkey releases the slot but before MongoDB marks the intent complete; verify that a retry does not add the slot twice.
- Release crashes before and after the Valkey release side effect.
- Release crash after MongoDB owner clear and before the Valkey release side effect.
- An old release retry after the slot is allocated to a newer reservation.
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
10. After a failed payment, the original key returns `CANCELLED` and a new key starts a new checkout.

The tests will also verify that one customer cannot read another customer result.

The tests will verify that an unauthenticated or non-owner browser cannot use the mock outcome route.

The tests will verify that the mock outcome route is disabled outside local and test environments.

The tests will verify that a browser cannot call the service-authenticated provider callback route.

The tests will verify that an authenticated service can call the provider callback route and that the mock outcome route uses the server-side session binding.

## Stress tests with k6

k6 will test these scenarios:

- Many users compete for fewer slots than requests.
- Many repeated attempts reuse an idempotency key.
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
| No overselling | Completed orders for one listing are less than or equal to `stockTotal`. |
| One completed order per customer and listing | At most one `COMPLETE` order exists for each `(listingId, customerId)` pair. Cancelled attempts do not block a new checkout. |
| One active customer ownership | The partial MongoDB index rejects a second `AWAITING_FACTS`, `PAYMENT_PENDING`, or `COMPLETE` order after `customerId` exists. |
| One slot owner | At most one order or reservation owns a `(listingId, slotId)` pair. |
| Idempotency | Repeating one key while Valkey retains its state uses one reservation identifier and one `orderId`; a retry can republish the event best effort. A new key is required after cancellation. |
| Sale window | No request outside the active window creates a reservation. |
| Durable persistence | Every acknowledged event has one matching MongoDB order fact record. |
| Duplicate safety | Replaying an SQS event or payment callback does not increase order count or release count. |
| Reorder safety | Reordered events do not move an order to an older state. |
| Terminal safety | A delayed SQS event does not reopen `CANCELLED`, and a delayed failure does not cancel `COMPLETE`. |
| Payment outcome | The first valid provider outcome wins. Later conflicting callbacks do not change the order or create another release. |
| Release exactly once | A failure or expiry adds one slot at most once, even after release replay. |
| Durable release intent | `CANCELLED`, its provider-event marker, and its pending release intent commit in one MongoDB transaction. The release worker retries pending intents until completion. |
| Callback access | Only an authenticated service can call the provider-shaped callback route. A browser can submit a mock outcome only for its own order in local or test mode. |
| Release ownership | An old release cannot clear a newer `currentReservationId`, customer claim, or `orderId`. |
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
- Added payment-first unowned-slot release coverage.
- Added immutable mock-session owner coverage.
- Added loss-between-pop-and-publish, closed-sale same-key retry, late-event, and manual-recovery coverage.
- Replaced durable replay and operator-recovery claims with the known pop-to-SQS gap and best-effort retry checks.
- Added conflicting callback, durable release intent, worker retry, and provider route authentication coverage.
