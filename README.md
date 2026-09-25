# Bookipi flash-sale

## Purpose

This repository contains the bootstrap and shared contracts for a high-throughput Bookipi flash-sale system.

The source requirements define one configurable sale, one product, limited stock, one item per user, purchase status, purchase results, a React frontend, high throughput, resilience, no overselling, unit and integration tests, stress tests, a system diagram, and implementation documentation.

Increment 1 adds package tooling, an OpenAPI health endpoint, Zod request validation, Express startup, and a static-export Next.js shell. Increment 2 adds authentication and durable listing and order models. Increment 3 adds verified Valkey listing publication, atomic inventory methods, and guarded cancellation release. Increment 4 adds the checkout Lambda REST handler and SQS reservation event publication. Increment 5 adds an Express SQS worker that stores reservation facts in MongoDB. Increment 6 adds a post-SQS payment redirect, the owner-checked mock payment page, and payment outcomes. Increment 8 adds public listing status, direct storefront checkout, and the REST REQUEST authorizer.

## Flow

The deployed system uses a Next.js storefront, an Express and Node API, CloudFront, API Gateway, Lambda, MongoDB, and Valkey. The local test stack uses Caddy as its same-origin edge and LocalStack for API Gateway, Lambda, and SQS.

The storefront sends sign-up and login requests to Better Auth routes on Express. Better Auth stores users and credentials in MongoDB. It stores sessions in Valkey secondary storage. The static storefront includes credentials when `NEXT_PUBLIC_API_BASE_URL` points to a different origin.

Express stores listing identity, product display name, sale window, and `reserveSlots`. The initial slot count is an operation parameter. MongoDB derives `stockTotal` from listing-slot documents and derives `publicStock = stockTotal - reserveSlots`.

Express creates the listing and its initial slot documents in one MongoDB transaction. It seeds all slots in one Valkey availability list and publishes only after seed verification. Every slot in this pool is claimable. Atomic Valkey pop prevents two requests from claiming the same slot. Transactional slot growth counts the existing slot documents and inserts the next sequential IDs.

The storefront reads listing status from `GET /api/listings/{listingId}` and the signed-in customer's current order from `GET /api/orders/current?listingId=...`. Listing status includes durable bought and remaining counts. It does not report the live Valkey pool. In deployment, the browser sends checkout to CloudFront. In the local stack, Caddy sends `/api/checkout` to the LocalStack REST API Gateway endpoint. Express never invokes Lambda or proxies the purchase request.

The deployed REST API uses a REQUEST Lambda authorizer. It checks `Origin` first and rejects a missing or unapproved value before it calls Better Auth or reads Valkey. Deployment configuration supplies the exact storefront origin allowlist.

The isolated [REST REQUEST authorizer prototype](infra/localstack/prototypes/rest-request-authorizer/) shows that LocalStack `2026.8.4` Hobby did not invoke or enforce the configured authorizer. The local API method uses `AuthorizationType: NONE`. It invokes a local authentication adapter in the checkout processor Lambda. The adapter checks the exact Origin and Better Auth session, then calls `startCheckout` with the verified `customerId`. It does not build authorizer context or call `handler.ts`. This Hobby workaround is not the production design and does not prove AWS authorizer behavior.

In deployment, the separate REQUEST authorizer checks the opaque Better Auth cookie and reads the session from Valkey secondary storage. The local adapter performs the same checks inside the combined checkout processor Lambda. The production handler receives the verified `customerId` from authorizer context. The local adapter passes the verified ID directly to `startCheckout`. Neither path calls Express or MongoDB. Better Auth uses MongoDB for users and credentials. The deployed CloudFront behavior must forward the session cookie and must not cache checkout responses. Local Caddy preserves the browser Cookie and Origin headers and does not add caching.

The authorizer uses Better Auth `getSession` with `disableRefresh: true` and `disableCookieCache: true`. It does not refresh an active session. Better Auth may still delete an expired session and return an expiry cookie. The authorizer cannot forward that cookie to the browser. API Gateway authorizer-result caching must be disabled. A missing session or Valkey error denies checkout. Valkey loss removes session state, so customers must sign in again after recovery.

The local browser origin is `http://bookipi.localhost:3200`. Caddy serves the storefront, backend API, and checkout under this one origin. Deployment must keep auth and checkout under the same host or within the Better Auth cookie scope. If deployment uses different origins, the storefront request must use `credentials: 'include'`.

The client sends an idempotency key. Lambda validates but does not change it. Valkey maps `(listingId, trusted customerId, client idempotencyKey)` to `orderId` and `slotId`. A same-key retry returns or republishes the same binding. Lambda sends `orderId`, `customerId`, `listingId`, and `slotId` in the SQS event. SQS is the only Lambda-to-Express bridge.

The Express SQS worker long-polls SQS, validates each strict `order-reserved.v1` event, and upserts the durable order by `orderId`. It acknowledges a message only after MongoDB persistence succeeds. It does not overwrite conflicting facts or reopen a terminal order.

The `/payment?orderId=...` page waits for MongoDB persistence, then uses an authenticated order read before it shows outcome controls. The owner can submit a mock success or failure. After the API accepts either outcome, the page opens `/order-status?orderId=...` to read and show the order status.

The order model stores `orderId`, `customerId`, `listingId`, `slotId`, `status`, optional `releaseStatus`, and timestamps. The payment feature applies mock outcomes. Provider callback correlation and payment reconciliation remain planned. The order feature reconciles cancellation releases through the guarded Valkey method after each reservation batch item and payment outcome.

After SQS supplies and validates the immutable binding, the first valid correlated payment outcome wins. A failure or expiry changes the order to `CANCELLED` and creates a pending release intent in the same MongoDB document update. The caller then verifies the durable order facts, returns the slot through the guarded Valkey operation, and marks the release complete. A matching release marker makes a retry safe after Valkey succeeds but MongoDB completion fails. If the process stops after cancellation and no caller retries, no background sweep repairs the pending release. SQS retries when reconciliation fails before acknowledgement. A payment caller must retry a failed or interrupted outcome request. A later checkout can claim a released slot.

The design has no durable replay for a Lambda crash after the Valkey pop and before SQS accepts the event.

The [reliability facet](docs/reliability.md) records current safeguards and possible future mitigations. Kafka and DynamoDB Streams are not part of this increment.

## Decisions & assumptions

The package map is:

- `packages/backend`: Express API, Better Auth email/password, public listing status, listing and slot models, order model, listing publication, deterministic demo seed, SQS reservation worker, authenticated order reads by ID and listing, and a payment feature.
- `packages/storefront`: Next.js browser experience.
- `packages/checkout-processor`: AWS Lambda request handling, hot-path reservation, payment redirect creation, and SQS publication.
- `packages/checkout-authorizer`: deployed API Gateway REST REQUEST authorization, with Better Auth session checks through Valkey.
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

The payment outcome route requires the authenticated order owner and configured backend order routes.

The provider-shaped mock callback route requires service authentication. The browser cannot call it.

The initial purchase quantity is exactly one.

The unique indexes allow one `PENDING` or `COMPLETE` order per customer and listing. A cancelled order does not block a later attempt.

A failed or expired payment releases the slot for a new checkout with a new idempotency key.

Provider callback correlation and reconciliation remain planned. The order model has no payment-provider fact fields. Mock cancellation records the durable release intent, and the SQS or payment caller returns the slot to Valkey.

Real payment-provider integration is outside this take-home scope.

The production REST API authorizer uses `packages/checkout-authorizer`. The local Hobby-only auth adapter is in `packages/checkout-processor`. Its Valkey network setup remains a deployment choice.

Read the design documents before runtime implementation.

## Future improvements

1. Break down the page state hooks to:
    a. Be closer to the component its loading
    b. Mutations are also defined close to the component its affecting
2. Remove excessive data-[...] attribute class selector in favor of standard react conditionals
    a. I only placed it there originally intending for elements whose parent state changes (eg: loading button, optional error message)
3. Add a deployment script for the resources
    a. Currently the stack demonstrates writing a cloudformation config, but for localstack and not for AWS
    b. Localstack Hobby plans does not support API gateway v2 HTTP, which we need for
    c. The lambda authorizer is currenlty shoehorned into the checkout processor, which is not ideal (but for local it works)
4. Have implemented a more robust approach for resumable checkout processing
    a. Can use kafka here to log certain checkpoints
    b. Or use dynamodb streams which are durable (until consumed)
5. Have redis run in not just one instance but multiple instances, same with mongodb.

## Gotchas

The home page shows the configured listing and current session. It sends checkout directly to `NEXT_PUBLIC_CHECKOUT_URL` and reuses one idempotency key after request failure. Sign-up, login, and mock payment pages provide the account and payment flow. The checkout processor handles REST proxy requests, claims inventory in Valkey, publishes `order-reserved.v1` to SQS, then creates the payment redirect. Backend startup requires `AWS_REGION` and `SQS_QUEUE_URL` and starts the SQS worker after MongoDB indexes initialize.

The checkout URL is a build-time storefront setting. The local stack sets it to `http://bookipi.localhost:3200/api/checkout`.

A crash or Valkey loss after the slot pop and before SQS publication can leave no queued order event. The design provides no durable replay for this gap and fails closed when slot ownership is unclear.

The repository has not performed external publication.

Do not report benchmark results before a stress test produces them.

The k6 checkout test uses private preloaded Better Auth session cookies. Create them with the backend local setup command and keep the session file in ignored `.artifacts/k6`. A Valkey reset invalidates these sessions. Read the [k6 checkout guide](load-tests/README.md) before a test.

If deployed storefront and checkout origins differ, configure credentialed CORS. Return the exact approved storefront origin in `Access-Control-Allow-Origin`, never `*`, and return `Access-Control-Allow-Credentials: true` on successful POST and relevant error responses. CloudFront must allow and forward `OPTIONS` and its preflight headers. The unauthenticated API Gateway `OPTIONS` method returns the required CORS headers. It must not use the checkout POST authorizer or invoke checkout. The local Caddy setup uses one origin and does not need a browser preflight.

The storefront reads `NEXT_PUBLIC_API_BASE_URL`, `NEXT_PUBLIC_LISTING_ID`, and `NEXT_PUBLIC_CHECKOUT_URL` at build time. The authorizer checks the exact `STOREFRONT_ORIGIN`. Set the same value for checkout response CORS when origins differ.

Commands in this README apply to the current runtime and planned system.

### Navigation

- [Repository rules](AGENTS.md)
- [Package map](packages/README.md)
- [Backend plan](packages/backend/README.md)
- [Storefront plan](packages/storefront/README.md)
- [Checkout processor plan](packages/checkout-processor/README.md)
- [Checkout authorizer plan](packages/checkout-authorizer/README.md)
- [Local infrastructure](infra/README.md)
- [Document map](docs/README.md)
- [System design entry point](docs/system-design.md)
- [Listing and inventory](docs/listing-and-inventory.md)
- [Checkout](docs/checkout.md)
- [Orders](docs/orders.md)
- [Payments](docs/payments.md)
- [Identity and access](docs/identity-and-access.md)
- [Reliability](docs/reliability.md)
- [Testing strategy](docs/testing-strategy.md)
- [k6 checkout guide](load-tests/README.md)
- [Implementation roadmap](docs/implementation-roadmap.md)

### Commands

```sh
node --version
pnpm --version
git status --short --branch
pnpm install
pnpm generate:api
pnpm package:lambdas
pnpm --filter @bookipi/backend dev
pnpm --filter @bookipi/backend seed
pnpm --filter @bookipi/checkout-authorizer test
pnpm --filter @bookipi/storefront test:e2e
pnpm format
pnpm format:check
pnpm typecheck
pnpm test
pnpm build
pnpm test:integration
git diff --check
```

Use Node.js 24 and pnpm 11.20. `pnpm build` runs the full local integration suite after package builds. The suite reads the raw LocalStack token from `.localstack`. Read [infra/README.md](infra/README.md) before you run the local stack. Set `NEXT_PUBLIC_API_BASE_URL`, `NEXT_PUBLIC_LISTING_ID`, and `NEXT_PUBLIC_CHECKOUT_URL` at build time.

The backend uses Node.js 24, NodeNext TypeScript, and `tsx` for development. Its development server uses port `3001`. Backend source uses the `#app`, `#api/*`, `#features/*`, `#services/*`, and `#types` package imports.

The local edge uses port `3200`. LocalStack uses port `4566`. The backend runs on port `3001` in its container.

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
- Implemented Increment 8 public listing status, direct storefront checkout, and the Valkey-backed REST REQUEST authorizer. Deployment checks remain pending.

### 2026-09-25

- Added authenticated home order status and sign-out, durable listing counts, and one order status page after mock outcomes.
- Added a local Better Auth session preload command and a k6 checkout load test.
