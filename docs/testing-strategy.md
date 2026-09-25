# Testing strategy

## Purpose

This document defines current test evidence and the planned test layers.

## Flow

Use focused unit tests for schema and feature logic. Use integration tests for MongoDB transactions, Valkey claims, and SQS delivery. Use browser tests for customer-visible behavior. Use k6 for load behavior.

The listing and order model tests use injected models and connections. They do not require a live database. They do not prove MongoDB transaction behavior.

## Unit tests with Vitest

Current tests cover:

- Listing input validation, safe Valkey hash-tag IDs, positive integer initial slot count, reserve bounds, sale-window order, and rejection of stored stock fields.
- Public count examples: 15 slots with 5 reserved gives 10; 10 slots with 2 reserved gives 8.
- Transactional listing creation and exactly one deterministic slot per initial slot.
- Total and public counts derived from `listing-slots` documents.
- Public listing-status response fields, durable slot-derived counts, and unknown-listing behavior.
- Transactional slot growth, sequential IDs, count updates, and positive integer validation.
- Listing and slot collection names and required indexes.
- Required order fields, statuses, unique order ID, and active customer/listing and listing/slot indexes.
- Order input rejects `idempotencyKey`. MongoDB does not store the key.
- Demo seed uses listing creation and publishes ten Valkey slots.
- Valkey seed and publication calls, post-transaction order, claim script boundaries, and guarded release calls.
- Better Auth configuration, session storage, identity mapping, Express request order, CORS, and storefront auth calls.
- Checkout request validation, authorizer identity handling, stable REST error responses, same-key republishing, retryable SQS failures, and the exact `order-reserved.v1` message shape.
- Payment session UUID validation, relative redirect construction, post-publication checkout ordering, redirect response mapping, and same-key redirect recreation.
- Checkout processor environment validation and lazy runtime client creation.
- Checkout authorizer exact-origin rejection before runtime access, cookie gating, Better Auth refresh/cache options, trusted customer context, and Deny behavior for missing sessions or Valkey errors.
- Checkout response `Cache-Control: no-store` headers and exact-origin credentialed CORS on accepted and error responses.
- Storefront listing reads, direct checkout request fields, credentials, unauthenticated responses, opaque-failure and ambiguous-403 session revalidation, stable error preservation, retry state, idempotency-key reuse, and endpoint URL normalization.
- Atomic inventory claim script boundaries, tuple-scoped key selection, sale window outcomes, active-order rejection, and cancellation outcomes.
- Order worker environment validation, SQS long-poll settings, strict event validation, acknowledgement command, reservation upsert replay, timestamp and terminal-status preservation, and conflicting-fact rejection.
- Payment outcome validation, atomic `PENDING` transitions, same-terminal-status retry (including `failure` followed by `expired`), conflicting terminal rejection, route availability when order routes are configured, owner checks, expiry handling, and order reads.
- Durable cancellation release state, guarded Valkey marker replay, trigger-driven reconciliation after SQS and payment outcomes, and completion only after Valkey success.

These tests do not prove MongoDB or Valkey integration.

## Integration tests

MongoDB integration tests will use a replica set for transaction behavior. They will cover:

- Listing creation stores listing metadata without a stock total and creates exactly the requested slot documents.
- Slot counts match the number of slot documents, and public count equals total slots minus `reserveSlots`.
- Concurrent slot additions serialize and create distinct sequential IDs.
- The unique `{ listingId, slotId }` index rejects duplicate slot ownership.
- Order indexes allow a cancelled attempt to be followed by a new active attempt. Active orders cannot duplicate a listing/customer or listing/slot pair.
- The SQS worker persists `orderId`, `customerId`, `listingId`, and `slotId` idempotently before it acknowledges a message.
- Better Auth stores users and credentials in MongoDB and sessions in Valkey secondary storage.

Valkey integration tests will cover atomic slot claims and map the client-generated `(listingId, trusted customerId, idempotencyKey)` tuple to a stable `orderId` and `slotId`. They will also cover sale-window boundaries, sold-out behavior, guarded release, and outage behavior.

LocalStack tests will cover SQS delivery, duplicate messages, retry behavior, and acknowledgement timing. MongoDB and SQS integration tests will verify that persistence completes before acknowledgement and that failed or conflicting events remain queued.

## Browser tests with Playwright

The controlled Playwright tests verify session display, public listing display, direct checkout request fields, credentialed cookie forwarding, sign-in guidance after an explicit unauthenticated response, expired-session revalidation after a readable API Gateway denial, active-session retry after a readable denial, same-key reuse, and navigation to the payment result. They use controlled route responses. They do not prove real sign-in, session authorization, CloudFront, API Gateway, or Valkey behavior.

The `/payment?orderId=...` page polls until the SQS worker persists the order. It shows outcome controls only after the authenticated API confirms ownership. Browser tests will verify pending, owner-not-found, request error, success, and cancellation states. Provider callback correlation remains planned work.

Deployment checks must verify CloudFront routing, session-cookie forwarding, `Origin` forwarding, disabled authorizer-result caching, and disabled checkout response caching. Cross-origin deployments must verify credentialed CORS on success and relevant errors, an unauthenticated `OPTIONS` response, and an authorizer-denial API Gateway `GatewayResponse` with the exact allowed Origin and `Access-Control-Allow-Credentials: true`. LocalStack and controlled browser routes do not prove these settings. No deployment configuration or proof exists in this repository.

## Stress tests with k6

k6 will test concurrent claims, repeated idempotency tuples, requests around the sale window, SQS delays, and short Valkey or MongoDB failures. Each report will state its load profile and environment before its results.

## Invariants and acceptance criteria

| Invariant                 | Acceptance check                                                                                                                         |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Derived inventory         | `stockTotal` equals the count of listing-slot documents. `publicStock` equals `stockTotal - reserveSlots`.                               |
| Initial slots             | Create listing with `initialSlotCount` and verify exactly that many unique slot IDs. Require `initialSlotCount >= reserveSlots`.         |
| Slot growth               | Add a positive integer count. Verify only the next sequential IDs are inserted in one transaction.                                       |
| Concurrent growth         | Concurrent calls do not create duplicate slot IDs. The transaction writes the listing before it counts slots.                            |
| Order identity            | Every order has one unique `orderId`, which also identifies the slot owner.                                                              |
| Idempotency               | Valkey keeps the exact client key mapping. A retry reuses `orderId` and `slotId`; a different customer, listing, or key cannot reuse it. |
| Active customer ownership | At most one `PENDING` or `COMPLETE` order exists for a listing and customer.                                                             |
| Active slot ownership     | At most one `PENDING` or `COMPLETE` order exists for a listing and slot.                                                                 |
| Cancellation              | A `CANCELLED` order does not block a later checkout for the same listing and customer.                                                   |
| Cancellation release      | A failure or expiry stores the release intent with cancellation. A matching Valkey marker can be retried without adding the slot twice.  |
| Release completion        | The order feature marks release complete only after Valkey success. A rejected SQS release remains unacknowledged for retry.             |
| SQS idempotency           | Replaying the same order event does not create another order or change its immutable facts, status, or timestamps.                       |
| Valkey claim              | An atomic claim assigns each available slot to at most one order.                                                                        |
| Sale window               | No request outside the active window creates a claim.                                                                                    |

## Expected results

The current seed creates one listing with `reserveSlots: 2` and ten available slot documents. Reads derive 10 total slots and 8 public slots. The seed publishes Valkey inventory and does not create orders. A repeat run with the same listing ID fails.

This increment has no measured load values. Later increments will define service targets after the local baseline and deployment shape are known.

Increment 4 and 5 unit tests do not prove atomic Valkey behavior, SQS delivery, or MongoDB persistence before acknowledgement. LocalStack, Valkey concurrency, MongoDB transactions, Lambda deployment, and API Gateway proxy checks remain pending. No deployment or LocalStack proof exists.

## Change log

### 2026-09-23

- Added tests for the minimal order schema and active ownership indexes.
- Added derived listing counts, initial slot creation, transactional slot growth, and listing-only seed checks.

### 2026-09-24

- Added checkout handler, scoped inventory claim, and SQS event unit tests.
- Added the active-customer key check to guarded cancellation release.
- Added SQS worker, strict event, durable order upsert, and acknowledgement unit tests. AWS and MongoDB integration checks remain pending.
- Added Mongoose timestamp and worker polling failure checks. AWS and MongoDB integration checks remain pending.
- Added mock outcome, owner check, expiry, polling client wrapper, and static payment page checks. Browser and service integration checks remain pending.
- Added payment-session redirect and post-SQS checkout tests. Browser and service integration checks remain pending.
- Added durable release intent, idempotent Valkey marker, and trigger-driven reconciliation checks. MongoDB and Valkey integration checks remain pending.
- Added guarded-release failure retry and `failure`/`expired` same-status retry checks.
- Added public listing status, origin-first authorizer, no-store and conditional CORS, and storefront checkout client tests.
- Added a controlled Playwright checkout retry test. Deployment integration remains pending.
