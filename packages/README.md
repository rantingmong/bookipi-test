# packages

## Purpose

This directory contains the planned runtime packages for the flash-sale system.

## Flow

The storefront sends status and result reads to the Express backend.

The browser sends the purchase request directly to the configured CloudFront endpoint. CloudFront routes it through API Gateway to the checkout processor.

The client sends an idempotency key. The checkout processor validates it and Valkey maps `(listingId, trusted customerId, client idempotencyKey)` to `orderId` and `slotId`. MongoDB does not store the key. The processor sends `orderId`, `customerId`, `listingId`, and `slotId` through SQS. SQS is the only Lambda-to-Express bridge.

The backend SQS worker consumes the event and writes immutable reservation facts to MongoDB. It acknowledges the message after persistence. MongoDB derives listing counts from slot documents.

The mock payment page uses `orderId` after the backend persists the SQS event. Payment callbacks remain planned.

The backend order model stores `orderId`, `customerId`, `listingId`, `slotId`, and `status`. Order transitions and the release worker remain planned.

A cancelled customer can start a new checkout with a new client key for the same listing. Valkey keeps the key mapping. MongoDB upserts SQS events by `orderId`.

The Express SQS worker long-polls the queue directly. It validates the strict event shape and upserts by `orderId` without changing existing facts or terminal status.

Standard SQS can duplicate and reorder events. The worker processes them idempotently.

## Decisions & assumptions

- `backend` owns Express API behavior, Better Auth, listing and slot models, order storage, and durable persistence. MongoDB stores users and credentials; Better Auth sessions use Valkey secondary storage. Listing creation seeds, verifies, and publishes its Valkey pool after the MongoDB transaction commits.
- `backend` uses Node.js 24, NodeNext TypeScript, and `tsx` for development. Its source uses the `#app`, `#api/*`, `#features/*`, `#services/*`, and `#types` package imports.
- `storefront` owns the Next.js user interface.
- `checkout-processor` owns REST Lambda request handling, hot-path reservation, and SQS publication. Its inventory feature atomically claims slots with scoped idempotency and one active order per customer and listing. It stores tuple and order data in listing-scoped hashes. The backend listing feature owns guarded cancellation release and clears the matching active-customer hash field.
- `backend` owns the Express SQS worker and planned order transitions.
- Express does not invoke Lambda or proxy the purchase request. API Gateway REST API uses a REQUEST authorizer that reads sessions from Valkey.
- `checkout-authorizer` owns the separate API Gateway REST REQUEST authorizer.
- Valkey scopes idempotency by listing, authorizer-derived customer, and client key.
- All packages use TypeScript and ECMAScript modules.
- Increment 1 adds runtime bootstraps for the backend and storefront. Increment 2 adds email/password authentication and listing/order model foundations. Increment 3 adds verified Valkey publication and guarded inventory methods. Increment 4 adds the checkout Lambda handler and SQS publication. Increment 5 adds the Express SQS consumer and durable reservation facts. Sale routes, order transitions, and the release worker remain planned.

## Gotchas

The backend exposes the system health contract and Better Auth email/password routes. It also has listing, slot, and order models with a deterministic listing seed that calls `createListing`. Listing creation publishes a verified Valkey inventory pool. Its SQS worker consumes reservation facts, but it has no listing or checkout routes. The checkout processor has a REST Lambda handler and SQS publisher, but no deployed Lambda or queue.

Do not add package scripts until the related runtime exists and its command is verified.

Read each package README before changing that package.

## Design links

- [System design](../docs/system-design.md)
- [Checkout](../docs/checkout.md)
- [Identity and access](../docs/identity-and-access.md)

## Change log

### 2026-09-22

- Added the package boundary map for design increment 0.
- Added payment fact and unified reconciliation boundaries.
- Clarified the Express SQS worker and terminal-state ownership.

### 2026-09-23

- Added the new-checkout-after-cancellation package boundary.
- Clarified the best-effort Valkey-to-SQS path and its crash gap.
- Added the durable cancellation release worker and immutable payment outcome rule.
- Corrected the browser checkout path to CloudFront, API Gateway, and Lambda.
- Moved Better Auth sessions to Valkey and recorded the REST REQUEST authorizer boundary.
- Made SQS the only Lambda-to-Express bridge for immutable mock-payment bindings.
- Required both payment and reservation facts before terminal state or slot release.
- Added the Better Auth email/password feature to the Express backend.
- Added the separate checkout-authorizer package and increment 1 runtime boundaries.

### 2026-09-24

- Added verified Valkey inventory publication after listing creation commits.
- Added atomic slot claims to the checkout processor and guarded cancellation release to the backend listing feature.
- Added the checkout processor REST handler and SQS publication flow.
- Added the Express SQS reservation worker and durable order upsert.
