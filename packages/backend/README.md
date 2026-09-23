# backend

## Purpose

The backend will provide the Express API and the durable services around the sale.

## Flow

Express will authenticate customers with Better Auth.

Express will create listings and `listing-slot` records in MongoDB.

Express will seed and verify the Valkey availability list before publication.

Express will expose sale status and purchase result reads.

Express will not invoke Lambda or proxy the purchase request.

The browser will send purchase requests directly to the configured CloudFront checkout endpoint. CloudFront will route them through API Gateway to the checkout Lambda.

An API Gateway Lambda authorizer will validate the Better Auth session with Better Auth semantics and pass trusted `customerId` to Lambda.

The Lambda will return the authoritative `orderId` and mocked payment session.

After SQS accepts the event, Lambda will call an internal Express mock-payment endpoint with service authentication. The endpoint will reject browser requests and create or reuse the immutable session record by `orderId` with Lambda's trusted `customerId`.

The binding will store `customerId` for authenticated owner checks.

The Express SQS worker will idempotently upsert reservation facts into MongoDB.

The worker will long-poll SQS directly. The selected design has no SQS-to-Lambda event source mapping.

A payment callback will upsert payment facts, even when it arrives before SQS.

Both paths will call one event-driven reconciliation and state-transition function.

The backend will record completed sales and final `orderId` ownership on `listing-slot` documents.

The reconciliation function will not scan Valkey or republish SQS events.

The first valid payment outcome for an order will be immutable. A success before SQS keeps the order `PAYMENT_PENDING`; later failure or expiry cannot cancel it. SQS facts then complete the order.

The callback transaction will store `CANCELLED` and a pending slot-release intent atomically with the provider-event marker.

An Express release worker will poll pending intents and clear the matching MongoDB `listing-slots` owner before Valkey release. It will allow an unowned slot, but it will skip a newer or secured/completed owner. It will mark each intent complete after Valkey succeeds. Retries will not add a slot twice.

A cancelled order keeps its original `(listingId, customerId, client idempotencyKey)` binding. A new client key can start a new checkout for that customer and listing.

The provider-shaped callback route and internal mock-session endpoint require service authentication. The browser can call only the owner-checked, local or test-only outcome route.

The callback stores its provider-event marker, first payment outcome, terminal transition, and any release intent in one MongoDB transaction.

## Decisions & assumptions

- MongoDB stores Better Auth records and business data.
- Better Auth email/password credentials use the MongoDB adapter.
- Express owns listing setup, authentication, reads, durable persistence, and event-driven order reconciliation.
- Express enforces simple customer and administrator roles.
- Checkout accepts exactly one item and a client idempotency key.
- The logical idempotency key also includes the listing and authorizer-derived customer identity.
- Only a `COMPLETE` order enforces one item per customer and listing.
- API Gateway supplies the trusted customer identity to Lambda after the authorizer validates the Better Auth session. Lambda ignores browser-supplied `customerId` values.
- The payment callback owns payment facts, and SQS owns reservation facts.
- Provider metadata correlates a callback with an order but does not authorize it.
- The backend will choose SQS dead-letter, visibility, batch, and polling settings in its implementation increment.

## Gotchas

This package has metadata only.

It has no API, worker, reconciler, source directory, dependencies, script, migration, or runtime URL.

Do not make Express the hot-path inventory authority.

Do not acknowledge an SQS event before MongoDB persistence succeeds.

Do not allow a delayed SQS event to reopen a cancelled order.

Do not let a later payment result replace the first valid provider outcome.

Do not write `CANCELLED` without a pending durable release intent in the same transaction.

Do not expose the service-authenticated provider callback route to browsers.

Do not expose the service-authenticated internal mock-session endpoint to browsers. The service credential mechanism remains an implementation choice.

Standard SQS can deliver duplicate or out-of-order messages. The worker must process them idempotently.

The system has no durable replay if Lambda stops after the Valkey pop and before SQS accepts the event. Keep checkout closed when inventory ownership is unclear.

## Design links

- [System design](../../docs/system-design.md)
- [Orders](../../docs/orders.md)
- [Payments](../../docs/payments.md)
- [Identity and access](../../docs/identity-and-access.md)

## Change log

### 2026-09-22

- Added the planned backend boundary and responsibilities.
- Added payment callbacks, field ownership, and unified reconciliation responsibilities.
- Clarified payment-first stubs, terminal winners, and direct SQS worker consumption.
- Clarified atomic provider-event processing and callback retry after a crash.

### 2026-09-23

- Added mock-session ownership, role boundaries, and guarded retry after cancellation.
- Added immutable session `customerId` checks for browser owner access.
- Clarified event-driven reconciliation and the best-effort SQS publish retry.
- Added immutable payment outcomes, transactional release intents, the Express release worker, and callback route authentication.
