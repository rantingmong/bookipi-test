# checkout-processor

## Purpose

The checkout processor will run as an AWS Lambda function for the purchase hot path.

Increment 3 adds `src/features/inventory/feature.ts` for atomic Valkey slot claims. The Lambda handler and SQS publication remain planned.

## Flow

For cookie-authenticated checkout POST requests, the API Gateway REST REQUEST Lambda authorizer will reject a missing or unapproved `Origin` before it calls Better Auth or reads Valkey. Deployment configuration supplies the exact origin allowlist.

After `Origin` passes, the authorizer will check the Better Auth session in Valkey and return only trusted `customerId` to API Gateway. API Gateway will forward that identity with the original listing identifier and idempotency key to the checkout Lambda.

The browser will call the CloudFront checkout endpoint. Express will not invoke Lambda or proxy the purchase request.

The client will send its idempotency key with the checkout request. The Lambda will validate but not generate or change that key. Valkey will map `(listingId, trusted customerId, client idempotencyKey)` to `orderId` and `slotId`. A same-key retry will return or republish the same binding.

The Lambda will use `orderId` as the slot-owner identifier. MongoDB will persist order fields without the idempotency key. Duplicate SQS delivery will upsert by `orderId`.

The Lambda will atomically check the sale window, idempotency, and one-item-per-user rule in Valkey, then pop one slot from the shared pool. The pool contains every durable listing-slot document. MongoDB derives the total and public counts from those documents.

The same Valkey operation will create the reservation and idempotency binding.

The Lambda will publish an order-reserved event to a Standard SQS queue. The event will contain `orderId`, `customerId`, `listingId`, and `slotId`.

SQS will be the only Lambda-to-Express bridge. The Express worker will persist the binding in MongoDB.

The Lambda will return a stable attempt result for safe retries.

## Decisions & assumptions

- Lambda owns hot-path Valkey reservation and SQS publication.
- API Gateway supplies trusted identity. Lambda ignores browser-supplied `customerId` values.
- The authorizer and checkout Lambda both need access to Valkey. Auth and inventory use separate key namespaces.
- A Valkey outage denies auth and stops reservation. Do not fall back to MongoDB for session checks.
- CORS and cookie `SameSite` settings do not replace the authorizer's required Origin check.
- The initial quantity is exactly one.
- `reserveSlots` reduces the advertised count derived from slot documents. At most as many orders can reach `COMPLETE` as there are slot documents.
- The Lambda can claim any slot in the one Valkey pool. The atomic pop, not the reserve count, prevents two requests from claiming one slot.
- A sold-out response requires an empty Valkey pool. A guarded cancellation release returns the slot to that same pool.
- SQS is transport and is not the durable order store.
- A retry uses the same `(listingId, trusted customerId, client idempotencyKey)` and reuses the reservation while Valkey retains its state.
- A repeated logical attempt by the same customer for the same listing returns the same `orderId`; another customer cannot reuse that binding.
- A new idempotency key cannot bypass a completed purchase, but it can start a new checkout after cancellation.
- SQS carries the order fields to Express. The mock payment page waits for MongoDB persistence, then uses `orderId` for owner-checked actions.
- The implementation increment will choose Lambda timeout and SQS delivery settings.

## Gotchas

This package has an inventory feature and TypeScript checks. It has no Lambda handler, SQS publisher, deployment file, or local URL.

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
