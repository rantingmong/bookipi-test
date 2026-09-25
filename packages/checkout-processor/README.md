# checkout-processor

## Purpose

The checkout processor runs as an AWS Lambda function for the purchase hot path.

This package provides the checkout Lambda handler, atomic Valkey reservation, and SQS publication. `src/runtime.ts` creates and reuses clients on the first valid request. The local stack deploys a packaged artifact to LocalStack API Gateway and Lambda. AWS deployment checks remain pending.

## Flow

In deployment, the separate API Gateway REST REQUEST Lambda authorizer rejects a missing or unapproved `Origin` before it calls Better Auth or reads Valkey. Deployment configuration supplies the exact origin allowlist.

After `Origin` passes, the deployed authorizer checks the Better Auth session in Valkey and returns only trusted `customerId` to API Gateway. API Gateway forwards that identity with the original listing identifier and idempotency key to this package's production handler.

In deployment, the browser calls the CloudFront checkout endpoint. In the local stack, the browser calls Caddy at `http://bookipi.localhost:3200/api/checkout`. Caddy routes it to LocalStack API Gateway and a local-only adapter in `src/local-handler.ts`. The adapter checks the exact `Origin` and Better Auth session in Valkey. It then calls `startCheckout` directly with the verified `customerId`. It does not build authorizer context or call `handler.ts`. Express does not invoke Lambda or proxy the purchase request.

The request sends `listingId` and `idempotencyKey` as JSON. The production handler reads trusted `customerId` only from `requestContext.authorizer.customerId`. The local adapter reads it from the validated Better Auth session. Both ignore browser-supplied customer identity. The Lambda validates but does not generate or change the idempotency key. Valkey maps `(listingId, trusted customerId, client idempotencyKey)` to `orderId` and `slotId`. A same-key retry returns and republishes the same binding.

The Lambda uses `orderId` as the slot-owner identifier. MongoDB persists order fields without the idempotency key. Duplicate SQS delivery upserts by `orderId`.

The Lambda atomically checks publication, sale time, idempotency, and one active order per customer and listing in Valkey. It then pops one slot from the shared pool. The pool contains every durable listing-slot document. MongoDB derives the total and public counts from those documents. The listing-scoped `idempotency`, `active-customers`, and `orders` hashes store tuple, owner, and order data. Every script receives its Redis keys through `KEYS`. Guarded cancellation release clears the matching active-customer hash field.

The same Valkey operation creates the reservation and idempotency binding.

The Lambda publishes `order-reserved.v1` to a Standard SQS queue. The event contains `eventType`, `orderId`, `customerId`, `listingId`, and `slotId`.

SQS is the only Lambda-to-Express bridge. The Express worker persists the binding in MongoDB.

The Lambda returns HTTP 202 with `orderId`, `PENDING`, and a relative `redirectUrl` only after SQS accepts the event. The payment feature creates that redirect from the same UUID order ID. It has no provider, persistent session, network call, or new environment setting. It returns stable JSON errors for invalid input, missing identity, unavailable inventory, and retryable service errors. An SQS failure leaves the Valkey claim in place. A same-key retry attempts publication again and can create the same redirect.

Every response sets `Cache-Control: no-store`. When `STOREFRONT_ORIGIN` is set and the request Origin matches it exactly, the handler adds that origin and `Access-Control-Allow-Credentials: true` to accepted responses and relevant errors. It does not echo an unapproved origin. This package does not handle `OPTIONS`.

## Decisions & assumptions

- Lambda owns hot-path Valkey reservation and SQS publication.
- In deployment, API Gateway supplies trusted identity. The local adapter checks the Better Auth session and creates trusted identity in-process. The handler ignores browser-supplied `customerId` values.
- The production handler uses `VALKEY_URL` and `ORDER_EVENTS_QUEUE_URL`. The local adapter also uses `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET`, and exact `STOREFRONT_ORIGIN`. It reads settings and creates clients only during an invocation. Imports do not read settings or connect services.
- Set `STOREFRONT_ORIGIN` for the local adapter. It must be one exact HTTP or HTTPS origin. Production deployment must match the authorizer allowlist and backend origin configuration.
- `src/types.ts` defines the shared checkout and runtime dependency contracts. Request and result types stay with the checkout feature.
- `src/features/payment` creates a validated relative mock payment redirect. Checkout calls it after reservation publication succeeds.
- Listing IDs use 1 to 128 ASCII letters, digits, underscores, or hyphens. The first character is a letter or digit so it cannot change the Valkey hash tag.
- The local combined Lambda checks sessions and claims inventory through separate Valkey key namespaces.
- A Valkey outage denies auth and stops reservation. Do not fall back to MongoDB for session checks.
- CORS and cookie `SameSite` settings do not replace the Origin check in either path.
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

The local template uses `AuthorizationType: NONE` because the isolated LocalStack `2026.8.4` Hobby prototype did not invoke or enforce a REST REQUEST authorizer. The [prototype](../../infra/localstack/prototypes/rest-request-authorizer/) is reproducible evidence. This combined adapter is a local workaround. It is not the production architecture and does not prove AWS behavior. Keep `src/handler.ts` for the production REQUEST-authorizer context.

This package has production and local Lambda entry points, checkout and inventory features, lazy Valkey and SQS clients, no-store responses, conditional credentialed CORS, tests, type checks, and a build. The local deployment template is in `infra/localstack/template.yaml`.

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
- Added the payment-session redirect after SQS publication and included it in the HTTP 202 response.
- Added scoped idempotency and the active-customer reservation key.
- Added no-store response headers and exact-origin credentialed CORS for checkout responses.
