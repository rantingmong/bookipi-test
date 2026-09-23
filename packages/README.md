# packages

## Purpose

This directory contains the planned runtime packages for the flash-sale system.

## Flow

The storefront sends status and result reads to the Express backend.

The browser sends the purchase request directly to the configured CloudFront endpoint. CloudFront routes it through API Gateway to the checkout processor.

The checkout processor generates candidate order and payment-session identifiers, then stores them in the atomic Valkey reservation. It sends the immutable order, customer, listing, reservation, slot, and session binding through SQS. SQS is the only Lambda-to-Express bridge.

The backend consumes the event and writes durable reservation and payment-session binding facts to MongoDB.

The payment callback sends payment facts to the same backend state-transition function.

The backend records the completed sale in MongoDB and releases cancelled slots once.

The order stays `AWAITING_FACTS` until both payment and SQS reservation facts exist. A payment-first failure holds the slot. After SQS validates slot ownership, one MongoDB transaction records `CANCELLED` and a pending release intent. An Express worker then retries the guarded release.

A cancelled customer can start a new checkout with a new client key for the same listing. Valkey scopes the key to that listing and trusted customer.

The Express SQS worker long-polls the queue directly.

Standard SQS can duplicate and reorder events. The worker processes them idempotently.

## Decisions & assumptions

- `backend` owns Express API behavior, Better Auth, listing setup, status reads, durable persistence, and event-driven order reconciliation. MongoDB stores users and credentials; Better Auth sessions use Valkey secondary storage.
- `storefront` owns the Next.js user interface.
- `checkout-processor` owns Lambda order creation, the hot path for reservation, SQS publication, and mock payment-session creation.
- `backend` owns the Express SQS worker, unified order transition, and pending slot-release worker.
- Express does not invoke Lambda or proxy the purchase request. API Gateway REST API uses a REQUEST authorizer that reads sessions from Valkey.
- `checkout-authorizer` owns the separate API Gateway REST REQUEST authorizer.
- Valkey scopes idempotency by listing, authorizer-derived customer, and client key.
- All packages use TypeScript and ECMAScript modules.
- Increment 1 adds runtime bootstraps for the backend and storefront. Business features remain planned.

## Gotchas

The backend exposes the system health contract. It has no authentication, listing, inventory, or checkout behavior yet.

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
- Added the separate checkout-authorizer package and increment 1 runtime boundaries.
