# packages

## Purpose

This directory contains the planned runtime packages for the flash-sale system.

## Flow

The storefront reads public listing status and customer-owned results from the Express backend.

In deployment, CloudFront routes checkout to API Gateway and its separate REQUEST authorizer. In the local stack, Caddy routes `/api/checkout` to LocalStack API Gateway, then to a Hobby-only authentication adapter in the checkout processor Lambda. Caddy sends other `/api/*` requests to Express and serves the storefront for other paths.

The client sends an idempotency key. The checkout processor validates it and Valkey maps `(listingId, trusted customerId, client idempotencyKey)` to `orderId` and `slotId`. MongoDB does not store the key. The processor sends `orderId`, `customerId`, `listingId`, and `slotId` through SQS. SQS is the only Lambda-to-Express bridge.

The backend SQS worker consumes the event and writes immutable reservation facts to MongoDB. It acknowledges the message after persistence. MongoDB derives listing counts from slot documents.

After SQS accepts the reservation event, the checkout processor creates a relative mock payment redirect from `orderId` and includes it in the HTTP 202 response. The mock payment page uses that order ID after the backend persists the SQS event. The backend checks ownership before it returns the order or applies a payment outcome. Provider callbacks remain planned.

The backend order model stores `orderId`, `customerId`, `listingId`, `slotId`, `status`, optional `releaseStatus`, and timestamps. The payment feature changes `PENDING` to `COMPLETE` or `CANCELLED`. The order feature reconciles durable cancellation release intents through guarded Valkey operations after reservation and payment outcomes. Provider reconciliation remains planned.

A cancelled customer can start a new checkout with a new client key for the same listing. Valkey keeps the key mapping. MongoDB upserts SQS events by `orderId`.

The Express SQS worker long-polls the queue directly. It validates the strict event shape and upserts by `orderId` without changing existing facts or terminal status.

Standard SQS can duplicate and reorder events. The worker processes them idempotently.

## Decisions & assumptions

- `backend` owns Express API behavior, Better Auth, listing and slot models, order storage, and durable persistence. MongoDB stores users and credentials; Better Auth sessions use Valkey secondary storage. Listing creation seeds, verifies, and publishes its Valkey pool after the MongoDB transaction commits.
- `backend` uses Node.js 24, NodeNext TypeScript, and `tsx` for development. Its source uses the `#app`, `#api/*`, `#features/*`, `#services/*`, and `#types` package imports.
- `storefront` owns the Next.js user interface. Shared payment order state lives in `src/lib/features`; page content lives in page-local `parts` directories.
- `storefront` reads `GET /api/listings/{listingId}` through a tracked generated-client wrapper. It sends checkout directly to `NEXT_PUBLIC_CHECKOUT_URL` with credentials. One idempotency key stays active for retries of that attempt.
- `checkout-processor` owns REST Lambda request handling, hot-path reservation, payment redirect creation, and SQS publication. Its inventory feature atomically claims slots with scoped idempotency and one active order per customer and listing. It stores tuple and order data in listing-scoped hashes. The backend listing feature owns guarded cancellation release and clears the matching active-customer hash field.
- `backend` owns the Express SQS worker, authenticated order reads, and payment outcome transitions.
- Express does not invoke Lambda or proxy the purchase request. The deployed API Gateway REST API uses a REQUEST authorizer that reads sessions from Valkey.
- `checkout-authorizer` contains the production API Gateway REST REQUEST handler. The isolated LocalStack `2026.8.4` Hobby prototype did not invoke or enforce that authorizer. See [the prototype](../infra/localstack/prototypes/rest-request-authorizer/).
- The local API method has `AuthorizationType: NONE`. A local-only adapter in `checkout-processor` checks Origin and the Better Auth session, then calls `startCheckout` with the verified `customerId`. It does not build authorizer context or call `handler.ts`.
- `infra/` owns the local Compose stack. It uses Caddy as a local edge. It does not emulate CloudFront.
- Valkey scopes idempotency by listing, authorizer-derived customer, and client key.
- All packages use TypeScript and ECMAScript modules.
- Increment 1 adds runtime bootstraps for the backend and storefront. Increment 2 adds email/password authentication and listing/order model foundations. Increment 3 adds verified Valkey publication and guarded inventory methods. Increment 4 adds the checkout Lambda handler and SQS publication. Increment 5 adds the Express SQS consumer and durable reservation facts. Increment 6 adds the static mock payment page, the payment-session redirect, owner-checked order routes, and payment outcomes. Increment 7 adds durable cancellation release and bounded worker retries. Increment 8 adds public listing status and the direct storefront purchase flow. Provider reconciliation remains planned.

## Gotchas

The backend exposes the system health contract, public listing status, Better Auth email/password routes, and owner-checked order routes. The payment outcome route is available whenever the order routes are configured. It also has listing, slot, and order models with a deterministic listing seed that calls `createListing`. Listing creation publishes a verified Valkey inventory pool. Its SQS worker consumes reservation facts. The checkout processor has a REST Lambda handler and SQS publisher. The local stack deploys emulated Lambda and SQS resources in LocalStack. It does not deploy AWS resources.

Do not add package scripts until the related runtime exists and its command is verified.

The local browser uses `http://bookipi.localhost:3200`. It uses one origin for auth, API reads, and checkout.

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
- Corrected the deployed browser checkout path to CloudFront, API Gateway, and Lambda.
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
- Added authenticated order reads and local or test mock outcomes for the static payment page.
- Added payment feature boundaries and the checkout response redirect to the mock payment page.
- Added trigger-driven cancellation release reconciliation and guarded Valkey marker recovery.
- Added the public listing route, direct storefront checkout, and the Valkey-backed REQUEST authorizer.

### 2026-09-25

- Added the Caddy local edge and LocalStack API Gateway, Lambda, and SQS stack.
