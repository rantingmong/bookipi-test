# Checkout

## Purpose

This document defines the purchase request path and the hot-path reservation rules.

## Flow

### Reserve and publish

```mermaid
sequenceDiagram
    participant A as API Gateway REST API
    participant L as Checkout Lambda
    participant V as Valkey
    participant Q as SQS Standard
    A->>L: Invoke with trusted customerId
    L->>L: Generate orderId
    L->>V: Atomically check sale and pop one slot from the shared pool
    V-->>L: Return orderId and slotId
    L->>Q: Publish immutable order event
    Q-->>L: Accept event
    L-->>A: Return 202 after SQS accepts event
```

### Persist reservation facts

```mermaid
sequenceDiagram
    participant Q as SQS Standard
    participant W as Express SQS worker
    participant M as MongoDB
    Q->>W: Deliver order event
    W->>M: Idempotently persist order fields
    M-->>W: Confirm durable write
    W-->>Q: Acknowledge event
```

The browser sends the checkout POST directly to the configured CloudFront endpoint with its Better Auth session cookie and `Origin` header. CloudFront forwards both values to the API Gateway REST API. The REQUEST Lambda authorizer checks `Origin` first. It rejects a missing or unapproved origin without calling Better Auth or reading Valkey. It checks the cookie and session only after the origin passes.

Listing IDs use 1 to 128 ASCII letters, digits, underscores, or hyphens. The first character is a letter or digit. This rule keeps the ID inside its Valkey hash tag.

Serve auth and checkout under the same host, or keep the checkout hostname within the Better Auth cookie scope. If the storefront and checkout origins differ, the storefront request uses `credentials: 'include'`. The exact hostnames remain a deployment choice.

For different origins, configure credentialed CORS. Return the exact approved storefront origin in `Access-Control-Allow-Origin`, never `*`, and return `Access-Control-Allow-Credentials: true` on successful POST and relevant error responses. CloudFront must allow and forward `OPTIONS` and its preflight headers. The unauthenticated API Gateway `OPTIONS` method returns the exact origin and credentials headers, plus `Access-Control-Allow-Methods` and `Access-Control-Allow-Headers` for required values. It must not use the POST authorizer or invoke checkout. Same-origin checkout does not require a preflight.

Express never invokes Lambda and never proxies the purchase request. SQS is the only Lambda-to-Express bridge. The request contains `listingId` and the client-generated `idempotencyKey`. The handler reads trusted `customerId` only from `requestContext.authorizer.customerId` and ignores browser identity data. Lambda validates but never creates or changes the idempotency key. Valkey maps `(listingId, trusted customerId, client idempotencyKey)` to `orderId` and `slotId`. It also allows one active order per customer and listing. A same-key retry returns and republishes the same binding. Lambda sends `eventType`, `orderId`, `customerId`, `listingId`, and `slotId` in `order-reserved.v1`. The Express SQS worker upserts MongoDB by `orderId`.

Lambda returns HTTP 202 with `{ orderId, status: "PENDING" }` only after SQS accepts `order-reserved.v1`. It returns HTTP 400 for invalid JSON or fields, HTTP 401 when trusted identity is missing, HTTP 409 for an unpublished listing, closed sale, sold-out pool, active order, or cancelled reservation, and HTTP 503 for retryable Valkey or SQS errors. The mock page waits until the SQS worker persists the order in MongoDB. It uses `orderId` for reads and owner-checked outcome actions.

Valkey contains every slot document in one claimable pool. MongoDB derives `stockTotal` by counting slot documents and derives `publicStock = stockTotal - reserveSlots`. Checkout rejects a request as sold out only when its atomic operation finds no claimable slot.

## Decisions & assumptions

- The request contains one client-generated `idempotencyKey`. It does not accept a quantity other than one.
- Atomic Valkey pop assigns each slot to at most one concurrent request. The reserve count does not prevent duplicate claims.
- Checkout can claim any slot in the one pool. A cancellation returns one slot to that same pool through the existing guarded release.
- The logical idempotency key is `(listingId, trusted customerId, client idempotencyKey)`. Only the same customer and listing can reuse a binding.
- MongoDB does not store the client idempotency key. If Valkey loses the binding, checkout fails closed and does not rebuild it from MongoDB.
- The API Gateway REQUEST Lambda authorizer checks `Origin` before it validates the Better Auth session. It passes trusted `customerId` to Lambda only when both checks pass. The Lambda ignores any browser-supplied `customerId`.
- Better Auth stores sessions in Valkey secondary storage. MongoDB stores users, credentials, and business data. The authorizer does not call Express or MongoDB.
- Keep `session.storeSessionInDatabase` unset or `false`. A missing Valkey session fails closed and requires a new login.
- The authorizer uses Better Auth `getSession` with `disableRefresh: true` and `disableCookieCache: true`. It does not refresh an active session. Better Auth may still delete an expired session and return an expiry cookie that the authorizer cannot forward. Normal Express auth responses handle active-session refresh.
- API Gateway authorizer-result caching is disabled, so checkout authorization reads current Valkey session state.
- For cookie-authenticated checkout POST requests, the authorizer requires an approved `Origin` value. It rejects a missing or unapproved origin before checkout runs.
- The approved origin allowlist contains exact storefront origins. Deployment configuration supplies its values; this design does not hard-code an origin.
- CORS and cookie `SameSite` settings do not replace the Origin check.
- The result includes `orderId` and the checkout status.
- The successful result is HTTP 202 and includes `orderId` and `PENDING` status.
- The SQS event contains only `eventType`, `orderId`, `customerId`, `listingId`, and `slotId`.
- Lambda does not request Express. SQS is the only Lambda-to-Express bridge.
- The same tuple reuses its order while Valkey retains the binding. It does not pop a second slot.
- A cancelled attempt does not block a later attempt for the same customer and listing.
- The same client key under another customer or listing creates an independent order.
- Guarded cancellation release removes the active-customer hash field only when it matches the cancelled order.
- MongoDB enforces one active order per customer and listing and one active owner per listing slot.
- A future checkout with DynamoDB must make its conditional write the atomic slot claim. Streams and EventBridge Pipes then carry committed claims to SQS.

## Gotchas

A Valkey pop before SQS publication creates a gap. A Lambda crash in that gap has no durable replay. A same-key retry is best effort while Valkey retains the reservation.

If SQS accepts an event but Lambda does not receive confirmation, a retry can publish a duplicate. The Express worker must process duplicates idempotently.

If Valkey state is missing or ownership is unclear, fail closed. Do not claim a durable replay path.

The deployed path does not define a local route, cookie name, or CloudFront path prefix. The selected identity design is in [Identity and access](identity-and-access.md).

CloudFront must forward the Better Auth session cookie and `Origin` header. It must not cache checkout responses. Cookie scope, `SameSite`, origin forwarding, and the approved-origin configuration need deployment checks. Test exact-origin credentialed CORS on successful POST and relevant error responses, plus unauthenticated preflight when origins differ.

See [API Gateway REST Lambda authorizer guidance](https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-use-lambda-authorizer.html), [CloudFront origin request guidance](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/controlling-origin-requests.html), and [Better Auth secondary storage guidance](https://better-auth.com/docs/concepts/database).

## Change log

### 2026-09-23

- Defined the browser-to-CloudFront-to-API-Gateway-to-Lambda purchase path.
- Recorded same-key retry limits and the Valkey-to-SQS crash gap.
- Selected Better Auth session validation through an API Gateway Lambda authorizer.
- Selected Valkey secondary storage for Better Auth sessions and REST REQUEST authorization.
- Added cookie-scope and conditional cross-origin CORS requirements.
- Required Origin rejection before Better Auth or Valkey access.
- Made SQS the only Lambda-to-Express bridge and added the immutable payment binding to the event.
- Made the mock page wait for the MongoDB binding before it enables owner-checked outcomes.
- Split reservation publication from SQS fact persistence and removed the preflight exchange.
- Defined the shared all-slot Valkey pool, sold-out check, and `stockTotal` completion limit.

### 2026-09-24

- Implemented the REST Lambda request handler, tuple-scoped Valkey reservation, and `order-reserved.v1` SQS publication.
- Defined stable checkout HTTP status and error responses.
