# checkout-processor

## Purpose

The checkout processor runs as an AWS Lambda function for the purchase hot path.

Increment 4 adds the API Gateway REST Lambda handler, atomic Valkey reservation, and SQS publication. `src/runtime.ts` creates and reuses clients on the first valid request. LocalStack and deployment checks remain pending.

## Flow

For cookie-authenticated checkout POST requests, the API Gateway REST REQUEST Lambda authorizer will reject a missing or unapproved `Origin` before it calls Better Auth or reads Valkey. Deployment configuration supplies the exact origin allowlist.

After `Origin` passes, the authorizer will check the Better Auth session in Valkey and return only trusted `customerId` to API Gateway. API Gateway will forward that identity with the original listing identifier and idempotency key to the checkout Lambda.

The browser will call the CloudFront checkout endpoint. Express will not invoke Lambda or proxy the purchase request.

The request sends `listingId` and `idempotencyKey` as JSON. The handler reads trusted `customerId` only from `requestContext.authorizer.customerId`. It ignores a browser `customerId`. The Lambda validates but does not generate or change the idempotency key. Valkey maps `(listingId, trusted customerId, client idempotencyKey)` to `orderId` and `slotId`. A same-key retry returns and republishes the same binding.

The Lambda will use `orderId` as the slot-owner identifier. MongoDB will persist order fields without the idempotency key. Duplicate SQS delivery will upsert by `orderId`.

The Lambda atomically checks publication, sale time, idempotency, and one active order per customer and listing in Valkey. It then pops one slot from the shared pool. The pool contains every durable listing-slot document. MongoDB derives the total and public counts from those documents. The listing-scoped `idempotency`, `active-customers`, and `orders` hashes store tuple, owner, and order data. Every script receives its Redis keys through `KEYS`. Guarded cancellation release clears the matching active-customer hash field.

The same Valkey operation will create the reservation and idempotency binding.

The Lambda publishes `order-reserved.v1` to a Standard SQS queue. The event contains `eventType`, `orderId`, `customerId`, `listingId`, and `slotId`.

SQS will be the only Lambda-to-Express bridge. The Express worker will persist the binding in MongoDB.

The Lambda returns HTTP 202 with `orderId` and `PENDING` only after SQS accepts the event. It returns stable JSON errors for invalid input, missing identity, unavailable inventory, and retryable service errors. An SQS failure leaves the Valkey claim in place. A same-key retry attempts publication again.

## Decisions & assumptions

- Lambda owns hot-path Valkey reservation and SQS publication.
- API Gateway supplies trusted identity. Lambda ignores browser-supplied `customerId` values.
- Runtime settings are `VALKEY_URL` and `ORDER_EVENTS_QUEUE_URL`. The runtime reads them and creates clients on the first valid checkout request. Imports do not read settings or connect services.
- `src/types.ts` defines the shared checkout and runtime dependency contracts. Request and result types stay with the checkout feature.
- Listing IDs use 1 to 128 ASCII letters, digits, underscores, or hyphens. The first character is a letter or digit so it cannot change the Valkey hash tag.
- The authorizer and checkout Lambda both need access to Valkey. Auth and inventory use separate key namespaces.
- A Valkey outage denies auth and stops reservation. Do not fall back to MongoDB for session checks.
- CORS and cookie `SameSite` settings do not replace the authorizer's required Origin check.
- The initial quantity is exactly one.
- `reserveSlots` reduces the advertised count derived from slot documents. At most as many orders can reach `COMPLETE` as there are slot documents.
- The Lambda can claim any slot in the one Valkey pool. The atomic pop, not the reserve count, prevents two requests from claiming one slot.
- A sold-out response requires an empty Valkey pool. A guarded cancellation release returns the slot to that same pool.
- A listing and customer can hold one active Valkey reservation. Cancellation clears the matching active key after the backend confirms the cancelled order.
- SQS is transport and is not the durable order store.
- A retry uses the same `(listingId, trusted customerId, client idempotencyKey)` and reuses the reservation while Valkey retains its state.
- A repeated logical attempt by the same customer for the same listing returns the same `orderId`; another customer cannot reuse that binding.
- A new idempotency key cannot bypass a completed purchase, but it can start a new checkout after cancellation.
- SQS carries the order fields to Express. The mock payment page waits for MongoDB persistence, then uses `orderId` for owner-checked actions.
- The implementation increment will choose Lambda timeout and SQS delivery settings.

## Gotchas

This package has a REST Lambda handler, checkout and inventory features, lazy Valkey and SQS clients, tests, type checks, and a build. It has no deployment file or local URL.

The Express SQS worker consumes the LocalStack queue. This design has no SQS-to-Lambda event source mapping.

If SQS publication fails after reservation, the Lambda returns a retryable service error. The same customer and listing can retry publication with the same client key while Valkey retains the reservation.

This retry is best effort. There is no durable replay if Lambda stops after the Valkey pop and before SQS accepts the event, or if Valkey loses the reservation state.

Standard SQS can deliver duplicate or out-of-order events. The backend worker handles them idempotently.

The backend listing feature provides the guarded Valkey release method. A future worker must confirm durable cancellation before it calls the method.

## Design links

- [System design](../../docs/system-design.md)
- [Checkout](../../docs/checkout.md)
- [Identity and access](../../docs/identity-and-access.md)

## Change log

### 2026-09-22

- Added the planned Lambda boundary and reservation responsibilities.
- Added authoritative order creation and mocked payment-session sequencing.
- Clarified immutable session binding and retry behavior after SQS publication.

### 2026-09-23

- Added compare-and-delete release rules for new checkout after cancellation.
- Added trusted `customerId` to the mock-session binding.
- Clarified best-effort retries and the Valkey pop-to-SQS crash gap.
- Updated the authorizer to API Gateway REST REQUEST and moved Better Auth sessions to Valkey.
- Required Origin rejection before Better Auth or Valkey access.
- Clarified that API Gateway forwards checkout fields and the authorizer returns only trusted `customerId`.
- Made SQS the only Lambda-to-Express bridge and stored candidate IDs in the atomic reservation for same-key reuse.
- Defined the single-pool claim rule, physical completion limit, and sold-out authority.
- Kept the Lambda package free of Express dependencies during the bootstrap increment.

### 2026-09-24

- Added the REST Lambda handler, validated runtime settings, and `order-reserved.v1` SQS publication.
- Added scoped idempotency and the active-customer reservation key.
