# backend

## Purpose

The backend will provide the Express API and the durable services around the sale.

## Flow

Express will authenticate customers with Better Auth.

Express will create listings and `listing-slot` records in MongoDB.

Express will seed and verify the Valkey availability list before publication.

Express will expose sale status and purchase result reads.

Express will invoke the checkout Lambda for purchase attempts.

The Lambda will return the authoritative `orderId` and mocked payment session.

An internal Express mock-payment endpoint will receive trusted `customerId` and create the immutable session record in MongoDB by `orderId`.

The binding will store `customerId` for authenticated owner checks.

The Express SQS worker will idempotently upsert reservation facts into MongoDB.

The worker will long-poll SQS directly. The selected design has no SQS-to-Lambda event source mapping.

A payment callback will upsert payment facts, even when it arrives before SQS.

Both paths will call one event-driven reconciliation and state-transition function.

The backend will record completed sales and final `orderId` ownership on `listing-slot` documents.

The reconciliation function will not scan Valkey or republish SQS events.

The first valid payment outcome for an order will be immutable. A success before SQS keeps the order `PAYMENT_PENDING`; later failure or expiry cannot cancel it. SQS facts then complete the order.

The callback transaction will store `CANCELLED` and a pending slot-release intent atomically with the provider-event marker.

An Express release worker will poll pending intents, run the guarded Valkey release, and mark each intent complete. Retries will not add a slot twice.

A cancelled order keeps its original key, and a new key can start a new checkout.

The provider-shaped callback route requires service authentication. The browser can call only the owner-checked, local or test-only outcome route.

The callback stores its provider-event marker, first payment outcome, terminal transition, and any release intent in one MongoDB transaction.

The browser mock outcome route requires the authenticated order owner and is disabled outside local and test environments.

## Decisions & assumptions

- MongoDB stores Better Auth records and business data.
- Better Auth email/password credentials use the MongoDB adapter.
- Express owns listing setup, authentication, reads, durable persistence, and event-driven order reconciliation.
- Express enforces simple customer and administrator roles.
- The purchase endpoint accepts exactly one item and a client idempotency key.
- Only a `COMPLETE` order enforces one item per customer and listing.
- The backend trusts only the authenticated customer identity supplied to the Lambda by Express.
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

Standard SQS can deliver duplicate or out-of-order messages. The worker must process them idempotently.

The system has no durable replay if Lambda stops after the Valkey pop and before SQS accepts the event. Keep checkout closed when inventory ownership is unclear.

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
