# Bookipi flash-sale

## Purpose

This repository contains the bootstrap and shared contracts for a high-throughput Bookipi flash-sale system.

The source requirements define one configurable sale, one product, limited stock, one item per user, purchase status, purchase results, a React frontend, high throughput, resilience, no overselling, unit and integration tests, stress tests, a system diagram, and implementation documentation.

Increment 1 adds package tooling, an OpenAPI health endpoint, Zod request validation, Express startup, and a static-export Next.js shell. Increment 2 adds authentication and durable listing and order models. Increment 3 adds verified Valkey listing publication, atomic inventory methods, and guarded cancellation release. Increment 4 adds the checkout Lambda REST handler and SQS reservation event publication. Increment 5 adds an Express SQS worker that stores reservation facts in MongoDB. Increment 6 adds a post-SQS payment redirect, the owner-checked mock payment page, and local or test payment outcomes.

## Flow

The planned system uses a Next.js storefront, an Express and Node API, CloudFront, API Gateway, an AWS Lambda checkout processor, MongoDB, Valkey, and LocalStack for local Lambda and SQS work.

The storefront sends sign-up and login requests to Better Auth routes on Express. Better Auth stores users and credentials in MongoDB. It stores sessions in Valkey secondary storage. The static storefront includes credentials when `NEXT_PUBLIC_API_BASE_URL` points to a different origin.

Express stores listing identity, product display name, sale window, and `reserveSlots`. The initial slot count is an operation parameter. MongoDB derives `stockTotal` from listing-slot documents and derives `publicStock = stockTotal - reserveSlots`.

Express creates the listing and its initial slot documents in one MongoDB transaction. It seeds all slots in one Valkey availability list and publishes only after seed verification. Every slot in this pool is claimable. Atomic Valkey pop prevents two requests from claiming the same slot. Transactional slot growth counts the existing slot documents and inserts the next sequential IDs.

The browser sends a purchase request directly to the configured CloudFront checkout endpoint. CloudFront routes the request through API Gateway to the checkout Lambda. Express never invokes Lambda and never proxies the purchase request.

For cookie-authenticated checkout POST requests, an API Gateway REST REQUEST Lambda authorizer checks `Origin` first. It rejects a missing or unapproved value without calling Better Auth or reading Valkey. Deployment configuration supplies the exact storefront origin allowlist.

After `Origin` passes, the authorizer checks the opaque Better Auth cookie and reads the session from Valkey secondary storage. It passes trusted `customerId` to Lambda. It does not call Express or MongoDB. Better Auth uses MongoDB for users and credentials. The Lambda ignores browser-supplied `customerId` values. CloudFront forwards the session cookie and does not cache checkout responses.

The authorizer uses Better Auth `getSession` with `disableRefresh: true` and `disableCookieCache: true`. It does not refresh an active session. Better Auth may still delete an expired session and return an expiry cookie. The authorizer cannot forward that cookie to the browser. API Gateway authorizer-result caching is disabled. A missing session or Valkey error denies checkout. Valkey loss removes session state, so customers must sign in again after recovery.

Serve auth and checkout under the same host, or keep the checkout hostname within the Better Auth cookie scope. If the storefront and checkout origins differ, the storefront request must use `credentials: 'include'`. The exact hostnames remain a deployment choice.

The client sends an idempotency key. Lambda validates but does not change it. Valkey maps `(listingId, trusted customerId, client idempotencyKey)` to `orderId` and `slotId`. A same-key retry returns or republishes the same binding. Lambda sends `orderId`, `customerId`, `listingId`, and `slotId` in the SQS event. SQS is the only Lambda-to-Express bridge.

The Express SQS worker long-polls SQS, validates each strict `order-reserved.v1` event, and upserts the durable order by `orderId`. It acknowledges a message only after MongoDB persistence succeeds. It does not overwrite conflicting facts or reopen a terminal order.

The `/payment?orderId=...` page waits for MongoDB persistence, then uses an authenticated order read before it shows outcome controls. The owner can submit a mock success or failure in local or test mode.

The order model stores `orderId`, `customerId`, `listingId`, `slotId`, `status`, optional `releaseStatus`, and timestamps. The payment feature applies mock outcomes. Provider callback correlation and payment reconciliation remain planned. The order feature reconciles cancellation releases through the guarded Valkey method after each reservation batch item and payment outcome.

After SQS supplies and validates the immutable binding, the first valid correlated payment outcome wins. A failure or expiry changes the order to `CANCELLED` and creates a pending release intent in the same MongoDB document update. The caller then verifies the durable order facts, returns the slot through the guarded Valkey operation, and marks the release complete. A matching release marker makes a retry safe after Valkey succeeds but MongoDB completion fails. If the process stops after cancellation and no caller retries, no background sweep repairs the pending release. SQS retries when reconciliation fails before acknowledgement. A payment caller must retry a failed or interrupted outcome request. A later checkout can claim a released slot.

The design has no durable replay for a Lambda crash after the Valkey pop and before SQS accepts the event.

The [reliability facet](docs/reliability.md) records current safeguards and possible future mitigations. Kafka and DynamoDB Streams are not part of this increment.

## Decisions & assumptions

The package map is:

- `packages/backend`: Express API, Better Auth email/password, listing and slot models, order model, listing publication, deterministic demo seed, SQS reservation worker, authenticated order reads, and a local or test payment feature; sale reads remain planned.
- `packages/storefront`: Next.js browser experience.
- `packages/checkout-processor`: AWS Lambda request handling, hot-path reservation, payment redirect creation, and SQS publication.
- `packages/checkout-authorizer`: API Gateway REST REQUEST authorization, planned for a later increment.
- `docs`: master flow, design facets, test strategy, and implementation roadmap.

The system uses pnpm, Node.js 24, TypeScript, and ECMAScript modules.

MongoDB stores Better Auth users, accounts, and credentials, plus future business data. Better Auth sessions use Valkey secondary storage with an auth key prefix.

Valkey provides temporary real-time inventory arbitration during the sale.

SQS transports events and is never the only order copy.

The logical idempotency key is `(listingId, trusted customerId, client idempotencyKey)`. The same customer and listing reuse one `orderId` while Valkey retains its state. Another customer or listing cannot reuse that binding.

Standard SQS provides at-least-once delivery and can reorder messages. The worker handles duplicate and out-of-order events by `orderId`.

MongoDB is the final persistence layer for completed sales and durable order facts.

At most as many orders can reach `COMPLETE` as there are slot documents. The advertised `publicStock` count does not limit the Valkey pool. The sale is sold out only when Valkey has no claimable slots.

The payment processor is mocked initially.

The storefront payment page provides success and failure buttons only after the SQS worker persists the order. The checkout response includes a relative payment redirect and the page uses `orderId` for its owner-checked outcome route.

The payment outcome route requires the authenticated order owner and a local or test-only flag.

The provider-shaped mock callback route requires service authentication. The browser cannot call it.

The initial purchase quantity is exactly one.

The unique indexes allow one `PENDING` or `COMPLETE` order per customer and listing. A cancelled order does not block a later attempt.

A failed or expired payment releases the slot for a new checkout with a new idempotency key.

Provider callback correlation and reconciliation remain planned. The order model has no payment-provider fact fields. Mock cancellation records the durable release intent, and the SQS or payment caller returns the slot to Valkey.

Real payment-provider integration is outside this take-home scope.

The separate REST API authorizer uses `packages/checkout-authorizer`. Its Valkey network setup remains open.

Read the design documents before runtime implementation.

## Gotchas

The home page provides the API health check. Sign-up, login, and mock payment pages provide the current account and payment flow. The checkout processor handles REST proxy requests, claims inventory in Valkey, publishes `order-reserved.v1` to SQS, then creates the payment redirect. Backend startup requires `AWS_REGION` and `SQS_QUEUE_URL` and starts the SQS worker after MongoDB indexes initialize. The storefront checkout flow, local service setup, and deployment remain planned.

The planned local URLs are not available.

A crash or Valkey loss after the slot pop and before SQS publication can leave no queued order event. The design provides no durable replay for this gap and fails closed when slot ownership is unclear.

The repository has not performed external publication.

Do not report benchmark results before a stress test produces them.

If the storefront and checkout origins differ, configure credentialed CORS. Return the exact approved storefront origin in `Access-Control-Allow-Origin`, never `*`, and return `Access-Control-Allow-Credentials: true` on successful POST and relevant error responses. CloudFront must allow and forward `OPTIONS` and its preflight headers. The unauthenticated API Gateway `OPTIONS` method returns the exact origin and credentials headers, plus `Access-Control-Allow-Methods` and `Access-Control-Allow-Headers` for required values. It must not use the checkout POST authorizer or invoke checkout. Same-origin checkout does not need a browser preflight.

Commands in this README apply to the current runtime and planned system.

### Navigation

- [Repository rules](AGENTS.md)
- [Package map](packages/README.md)
- [Backend plan](packages/backend/README.md)
- [Storefront plan](packages/storefront/README.md)
- [Checkout processor plan](packages/checkout-processor/README.md)
- [Checkout authorizer plan](packages/checkout-authorizer/README.md)
- [Document map](docs/README.md)
- [System design entry point](docs/system-design.md)
- [Listing and inventory](docs/listing-and-inventory.md)
- [Checkout](docs/checkout.md)
- [Orders](docs/orders.md)
- [Payments](docs/payments.md)
- [Identity and access](docs/identity-and-access.md)
- [Reliability](docs/reliability.md)
- [Testing strategy](docs/testing-strategy.md)
- [Implementation roadmap](docs/implementation-roadmap.md)

### Commands

```sh
node --version
pnpm --version
git status --short --branch
pnpm install
pnpm generate:api
pnpm --filter @bookipi/backend dev
pnpm --filter @bookipi/backend seed
pnpm format
pnpm format:check
pnpm typecheck
pnpm test
pnpm build
git diff --check
```

Use Node.js 24 and pnpm 11.20. Set `NEXT_PUBLIC_API_BASE_URL` at build time to configure the static storefront's browser API client. Set `NEXT_PUBLIC_MOCK_PAYMENT_ENABLED=true` for local or test storefront builds that need mock outcome controls. Local service URLs are not defined.

The backend uses Node.js 24, NodeNext TypeScript, and `tsx` for development. Its development server uses port `3001`. Backend source uses the `#app`, `#api/*`, `#features/*`, `#services/*`, and `#types` package imports.

## Change log

### 2026-09-22

- Created design increment 0 with the repository shell and design documents.
- Recorded Lambda order creation, mocked payment callbacks, and unified order reconciliation.
- Clarified payment-session binding, Express SQS consumption, and terminal-state recovery.

### 2026-09-23

- Added mock-session security, Valkey rebuild recovery, and cancelled-payment retry behavior.
- Clarified best-effort SQS retry and the known Valkey pop-to-SQS crash gap.
- Clarified first-outcome payment rules, durable release intents, and callback route authentication.
- Moved Better Auth sessions to Valkey and selected a REST REQUEST authorizer that does not refresh active sessions.
- Recorded cookie-scope and conditional cross-origin CORS requirements.
- Required Origin rejection before Better Auth or Valkey access.
- Made SQS the only Lambda-to-Express bridge and put the immutable mock payment binding in the event.
- Kept payment-first orders in `AWAITING_FACTS` until SQS validates slot ownership.
- Serialized callback outcomes by per-order receive sequence and clarified mock buttons after callback quarantine.
- Defined `stockTotal`, configurable `reserveSlots`, derived `publicStock`, and one Valkey pool for every physical slot.
- Named the customer-facing cancellation flow slot reallocation after order cancellation; technical release markers keep their names.
- Added increment 1 package tooling, OpenAPI generation, API bootstrap, and static storefront export.
- Recorded possible future reliability mitigations without changing the selected runtime design.
- Implemented the Better Auth email/password slice of Increment 2 with MongoDB accounts and Valkey sessions. Listing setup remains pending.

### 2026-09-24

- Added the checkout Lambda handler, tuple-scoped Valkey reservation, and SQS publication for increment 4.
- Added the Express SQS worker and idempotent MongoDB persistence for increment 5. AWS SQS and MongoDB integration checks remain pending.
- Implemented the static mock payment page, authenticated order reads, post-SQS redirect creation, and local or test payment outcomes for increment 6. Browser, MongoDB, SQS, and deployment checks remain pending.
- Added trigger-driven mock cancellation release reconciliation with guarded Valkey marker recovery. MongoDB and Valkey integration checks remain pending.
