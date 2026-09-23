# backend

## Purpose

The backend will provide the Express API and the durable services around the sale.

## Flow

Express will authenticate customers with Better Auth.

Express will create listings with `stockTotal` as the physical slot count and configurable `reserveSlots` as a subset. It will derive `publicStock = stockTotal - reserveSlots` and create one `listing-slot` record per physical slot in MongoDB.

Express will seed and verify one Valkey availability list with all `stockTotal` slots before publication.

Express will expose sale status and purchase result reads.

Express will not invoke Lambda or proxy the purchase request.

The browser will send purchase requests directly to the configured CloudFront checkout endpoint. CloudFront will route them through API Gateway to the checkout Lambda.

An API Gateway REST REQUEST Lambda authorizer will reject a missing or unapproved `Origin` before it calls Better Auth or reads Valkey. After the origin passes, it will check the Better Auth cookie with Better Auth semantics. It will use `getSession` with `disableRefresh: true` and `disableCookieCache: true`, then pass only trusted `customerId` to Lambda. It will not refresh an active session. Better Auth may still delete an expired session and return an expiry cookie that the authorizer cannot forward.

The Lambda will return a candidate `orderId` and mocked payment session ID. The atomic Valkey claim stores the authoritative values. A same-key retry reuses the stored values.

The SQS event will contain the immutable `orderId`, `customerId`, `listingId`, `reservationId`, `slotId`, and `paymentSessionId` binding. SQS is the only Lambda-to-Express bridge. The Express SQS worker will persist the binding in MongoDB.

The mock payment page will wait for the MongoDB binding. Express will check its stored `customerId` before it enables owner-checked outcome buttons.

The worker will long-poll SQS directly. The selected design has no SQS-to-Lambda event source mapping.

A payment callback will upsert payment facts, even when it arrives before SQS.

Both paths will call one event-driven reconciliation and state-transition function.

The backend will record completed sales and final `orderId` ownership on `listing-slot` documents.

The reconciliation function will not scan Valkey or republish SQS events.

The order will stay `AWAITING_FACTS` until both payment and SQS reservation facts exist. A provider callback can arrive first with `orderId` and `paymentSessionId`, and may omit `reservationId` or `slotId`. Release will never rely on webhook slot fields. The callback will store a pending payment fact and marker. It will not release the slot. After SQS facts arrive, the backend will validate callback correlation. It will quarantine a mismatch. The first valid correlated outcome will then become immutable.

After correlation succeeds, one MongoDB transaction will store `CANCELLED` and a pending slot-release intent. For a payment-first callback, the earlier pending fact and event marker use a separate transaction. For an SQS-first callback, the callback transaction can store the marker, outcome, terminal state, and release intent together.

An Express release worker will poll pending intents and clear the matching MongoDB `listing-slots` owner before Valkey release. It will run only after the SQS binding proves slot ownership. It will skip a newer or secured/completed owner. It will mark each intent complete after Valkey succeeds. Retries will not add a slot twice.

A cancelled order keeps its original `(listingId, customerId, client idempotencyKey)` binding. A new client key can start a new checkout for that customer and listing.

The provider-shaped callback route requires service authentication. The browser can call only the owner-checked, local or test-only outcome route.

MongoDB atomically assigns each new authenticated provider event a per-order receive sequence with its event marker and pending fact. Callback insertion, SQS binding persistence, reconciliation, and terminal transitions serialize through the same per-order record. Each terminal transition selects the lowest-sequence committed event that matches the SQS binding. It does not use provider-supplied timestamps. A callback that commits after binding persistence but before reconciliation participates in the sequence check. A write conflict retries the full transaction.

After SQS persists the binding, a quarantined callback does not block the mock outcome buttons if the order remains `AWAITING_FACTS` and has no valid payment outcome. Express checks the authenticated owner before it shows the buttons.

Each new release intent starts with `releaseAttemptStarted=false`. The release worker initializes a Valkey `not_applied` marker before its first release call and records `releaseAttemptStarted=true` before that call. It checks the marker first. An applied marker completes the old intent without changing slot ownership. Only a positively known `not_applied` marker allows the MongoDB owner guard. A newer owner, Valkey stale-owner result, missing marker after an attempt, expired marker, or unavailable marker keeps the intent pending for manual reconciliation.

Only `stockTotal` physical slots exist, including the configured reserve. The Valkey pool contains every slot. At most `stockTotal` orders can reach `COMPLETE`.

## Decisions & assumptions

- MongoDB stores Better Auth users, accounts, and credentials, plus business data.
- Better Auth email/password credentials use the MongoDB adapter.
- Better Auth sessions use Valkey secondary storage. Keep `session.storeSessionInDatabase` unset or `false`, so an absent session does not fall back to MongoDB.
- The authorizer does not call Express or MongoDB. It denies checkout when Valkey is unavailable or the session is missing.
- Valkey stores a user snapshot with each session. Checkout uses only `customerId`; privileged Express routes read current roles from MongoDB or invalidate sessions after role changes.
- A full Valkey loss removes active sessions. Customers must sign in again after recovery. Do not claim durable session storage.
- Express owns listing setup, authentication, reads, durable persistence, and event-driven order reconciliation.
- Express enforces simple customer and administrator roles.
- Checkout accepts exactly one item and a client idempotency key.
- The logical idempotency key also includes the listing and authorizer-derived customer identity.
- Only a `COMPLETE` order enforces one item per customer and listing.
- API Gateway supplies the trusted customer identity to Lambda after the authorizer validates the Better Auth session. Lambda ignores browser-supplied `customerId` values.
- The payment callback owns payment facts, and SQS owns reservation facts and the immutable mock-session binding.
- Provider metadata correlates a callback with an order but does not authorize it.
- The backend will choose SQS dead-letter, visibility, batch, and polling settings in its implementation increment.

## Gotchas

This package has metadata only.

It has no API, worker, reconciler, source directory, dependencies, script, migration, or runtime URL.

Do not make Express the hot-path inventory authority.

Do not acknowledge an SQS event before MongoDB persistence succeeds.

Do not allow a delayed SQS event to reopen a cancelled order.

Do not let a later payment result replace the first valid provider outcome.

Do not write `CANCELLED` without a pending durable release intent in the same transaction. Do not terminalize a payment-first stub before SQS proves slot ownership.

Do not expose the service-authenticated provider callback route to browsers.

SQS carries the immutable binding from Lambda to Express.

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
- Moved Better Auth sessions to Valkey secondary storage and defined active-session refresh and expired-session cleanup behavior.
- Required Origin rejection before Better Auth or Valkey access.
- Made SQS the only Lambda-to-Express bridge and delayed payment-first terminal state until SQS correlation.
- Serialized callback reconciliation by per-order receive sequence and preserved mock outcomes after a quarantined callback.
- Added the physical slot count, derived public count, and all-slot Valkey seed responsibility.
