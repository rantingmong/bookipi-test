# packages

## Purpose

This directory contains the planned runtime packages for the flash-sale system.

## Flow

The storefront sends status and result reads to the Express backend.

The browser sends the purchase request directly to the configured CloudFront endpoint. CloudFront routes it through API Gateway to the checkout processor.

The client sends an idempotency key. The checkout processor validates it and Valkey maps `(listingId, trusted customerId, client idempotencyKey)` to `orderId` and `slotId`. MongoDB does not store the key. The processor sends `orderId`, `customerId`, `listingId`, and `slotId` through SQS. SQS is the only Lambda-to-Express bridge.

The backend consumes the event and writes the durable order fields to MongoDB. MongoDB derives listing counts from slot documents.

The mock payment page uses `orderId` after the backend persists the SQS event. Payment callbacks remain planned.

The backend order model stores `orderId`, `customerId`, `listingId`, `slotId`, and `status`. Order transitions and cancelled-slot release remain planned.

A cancelled customer can start a new checkout with a new client key for the same listing. Valkey keeps the key mapping. MongoDB upserts SQS events by `orderId`.

The Express SQS worker long-polls the queue directly.

Standard SQS can duplicate and reorder events. The worker processes them idempotently.

## Decisions & assumptions

- `backend` owns Express API behavior, Better Auth, listing and slot models, order storage, and durable persistence. MongoDB stores users and credentials; Better Auth sessions use Valkey secondary storage.
- `backend` uses Node.js 24, NodeNext TypeScript, and `tsx` for development. Its source uses the `#app`, `#api/*`, `#features/*`, and `#services/*` package imports.
- `storefront` owns the Next.js user interface.
- `checkout-processor` owns Lambda order creation, the hot path for reservation, and SQS publication.
- `backend` owns the planned Express SQS worker and order transitions.
- Express does not invoke Lambda or proxy the purchase request. API Gateway REST API uses a REQUEST authorizer that reads sessions from Valkey.
- `checkout-authorizer` owns the separate API Gateway REST REQUEST authorizer.
- Valkey scopes idempotency by listing, authorizer-derived customer, and client key.
- All packages use TypeScript and ECMAScript modules.
- Increment 1 adds runtime bootstraps for the backend and storefront. Increment 2 adds email/password authentication and listing/order model foundations. Listing publication and sale behavior remain planned.

## Gotchas

The backend exposes the system health contract and Better Auth email/password routes. It also has listing, slot, and order models with a deterministic listing seed. It has no listing publication or checkout routes.

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
