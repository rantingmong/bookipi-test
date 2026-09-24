# Implementation roadmap

## Purpose

This roadmap divides the flash-sale system into small increments that a user can review.

Each feature increment lists two implementation angles before a choice.

## Flow

Complete one increment, verify it, review its evidence, and then select the next increment.

Keep runtime changes inside the selected increment.

Update the affected README and design document when a decision changes.

## Decisions & assumptions

- Increment 0 records the system design. Increment 1 is complete. The authentication slice of Increment 2 is complete, and listing setup remains pending.
- The selected stack remains pnpm, TypeScript, Express, Next.js static export, CloudFront, API Gateway, Lambda, MongoDB, Valkey, and LocalStack.
- API Gateway REST API uses `packages/checkout-authorizer` for its separate REQUEST Lambda authorizer. It checks Better Auth sessions in Valkey.
- Each future feature needs a user review before implementation if its angles change behavior or system boundaries.
- Increment 1 provides the first runtime bootstrap. Listing and sale behavior after the authentication slice remains planned.

## Increment 0: repository shell and design record

Status: selected and documented.

Create repository rules, package metadata, package context READMEs, design documents, and test plans.

Angle A: write the complete design record before runtime code.

Angle B: start with a minimal API and infer the design from code.

Selection: Angle A.

Reason: the take-home requires explicit trade-offs, failure paths, diagrams, and staged work.

Verification: JSON parsing, Markdown link checks, Mermaid syntax review, `git diff --check`, and worktree status.

## Increment 1: repository bootstrap and shared contracts

Status: complete.

Angle A: define OpenAPI YAML contracts and Zod validation first, then add package tooling.

Angle B: add service bootstraps first, then derive contracts from route handlers.

Selection: Angle A. The API uses one contract file per endpoint, a group configuration file, and a generated Express router. The dedicated authorizer package is approved.

Increment 1 adds the Express bootstrap and health endpoint, generated server bindings and browser client, protected-route middleware, and the static-export storefront shell. It does not add Better Auth, persistence, inventory, checkout, or SQS runtime behavior.

Verification: package metadata validation, API generation, TypeScript checks, contract middleware tests, package builds, HTTP health smoke check, and `git diff --check`.

## Increment 2: Better Auth and listing setup

Status: authentication slice complete; listing setup remains pending.

Angle A: keep Better Auth, listing creation, and seed orchestration in Express. Store Better Auth users and credentials in MongoDB, and sessions in Valkey secondary storage.

Angle B: isolate authentication or listing setup into separate services.

Selection recorded by this design: Angle A with Valkey secondary storage for sessions and MongoDB for users and credentials. This increment implements email/password sign-up, login, session display, and sign-out. It does not implement listing setup.

Reason: one backend boundary reduces coordination for the small take-home while keeping the hot path in Lambda.

Authentication verification: focused tests cover required settings, storage selection, no MongoDB session fallback, session identity mapping, raw Express request ordering, and credentialed browser requests. MongoDB and Valkey integration, cookie expiry, revocation, listing-slot uniqueness, seed verification, and deployment authorizer checks remain pending. The separate authorizer makes no Express or MongoDB request.

Listing setup keeps `stockTotal` as the true physical slot count and adds configurable `reserveSlots`. Validate integer counts, require `stockTotal > 0`, and enforce `0 <= reserveSlots <= stockTotal`. Derive `publicStock = stockTotal - reserveSlots`.

## Increment 3: Valkey seed and sale status

Status: awaiting review.

Angle A: seed Valkey synchronously and publish only after verification.

Angle B: publish first and repair the availability list with an asynchronous job.

Selection recorded by this design: Angle A.

Reason: a failed seed must fail closed instead of exposing a partially available sale.

Planned verification: seed counts, publication state, sale-window boundaries, and status reads.

Seed all `stockTotal` physical slots into one Valkey pool. Verify examples: 15 total and 5 reserve gives public count 10; 10 total and 2 reserve gives public count 8. Verify that publication fails if the seed count does not equal `stockTotal`.

## Increment 4: checkout reservation and SQS publication

Status: awaiting review.

Angle A: Lambda owns atomic Valkey reservation and SQS publication.

Angle B: Express owns atomic reservation and Lambda only consumes an event.

Angle B would make an SQS message an intent, not a reservation. A consumer must claim a slot atomically before the API can confirm the purchase.

Selection recorded by this design: Angle A.

Reason: the hot path stays close to Valkey and scales independently from durable reads and writes.

Planned verification: concurrent requests, no overselling, one item per user, stable `orderId` for the same `(listingId, trusted customerId, client idempotencyKey)` while Valkey state remains, cross-customer key isolation, best-effort publish retry, duplicate SQS delivery, and the documented crash gap after the Valkey pop.

The atomic claim pops any one slot from the shared pool. The reserve count does not route claims or provide concurrency protection. Reject checkout as sold out only when Valkey has no claimable slots. At most `stockTotal` orders can reach `COMPLETE`; cancellation returns a slot to the same pool through guarded release. Verify that ten distinct authenticated customers can complete with `stockTotal: 10` and `reserveSlots: 2`, including customers 9 and 10 through the hidden allowance. Then verify that an 11th distinct authenticated customer with a fresh idempotency key receives a sold-out result while the sale remains active and no cancellation occurs.

## Increment 5: durable reservation facts

Status: awaiting review.

Angle A: let the Express SQS worker upsert reservation facts directly into MongoDB.

Angle B: store every SQS event in an event log before updating the order.

Selection recorded by this design: Angle A.

Reason: the selected path keeps the first implementation small while unique indexes provide idempotent facts.

Planned verification: duplicate and reordered events, acknowledgement timing, durable order facts, and idempotent handling of Standard SQS delivery.

## Increment 6: mock payment session and page

Status: awaiting review.

Angle A: add a Next.js mock payment page with success and failure buttons. The page calls an owner-checked outcome route, and Express translates the result into the shared callback handler.

Angle B: run a separate local payment emulator and connect the storefront to its callback endpoint.

Selection recorded by this design: Angle A. Lambda creates candidate `orderId` and `paymentSessionId` values before the atomic Valkey claim. The claim stores them. The SQS event carries the immutable binding to the Express worker. The page waits for MongoDB persistence before it shows owner-checked buttons.

Reason: the page exercises the same callback rules without exposing the service-authenticated callback route or adding a second local service.

Planned verification: SQS-backed mock-session correlation, page pending state, success, failure, expiry, callback replay, owner checks, and callback correlation mismatch quarantine. A provider callback may arrive before SQS; it stores a pending fact and leaves the order `AWAITING_FACTS` without releasing the slot.

## Increment 7: unified order reconciliation and durable slot release

Status: awaiting review.

Angle A: send SQS and payment facts to one reconciliation and state-transition function. Keep the order `AWAITING_FACTS` until both facts exist and callback correlation matches. Store a release intent with `CANCELLED`, then let an Express worker run the guarded Valkey release.

Angle B: keep separate SQS and payment state machines and merge their results in a periodic batch job.

Selection recorded by this design: Angle A.

Reason: one transition function makes event order and terminal-state rules explicit.

Planned verification: both event orders, conflicting payment outcomes in both arrival orders, payment-first pending state, callback correlation mismatch quarantine, duplicate events, terminal transitions, atomic cancellation and release intent after binding validation, worker retry after crashes, new checkout after cancellation, compare-and-delete release, active partial-index rejection, old release replay after slot reallocation, and final `listing-slot.orderId` ownership.

## Increment 8: storefront purchase experience

Status: awaiting review.

Angle A: let the browser call the configured CloudFront checkout endpoint directly. CloudFront routes to API Gateway REST API, whose REQUEST Lambda authorizer checks the Better Auth session in Valkey before checkout Lambda runs.

Angle B: add a Next.js backend-for-frontend route that proxies the CloudFront checkout endpoint.

Selection recorded by this design: Angle A.

Reason: the purchase request must bypass Express. The direct path has fewer request hops and keeps the hot path in API Gateway and Lambda.

Planned verification: Playwright sign-in, status reads, direct checkout, session authorization, missing and unapproved Origin rejection, purchase retry, mock payment, result reads, access control, and disabled checkout response caching. Verify cookie scope and CloudFront cookie and Origin forwarding in a deployment-shaped test. If origins differ, verify credentialed CORS on POST and error responses, plus an unauthenticated OPTIONS method. LocalStack does not prove these behaviors.

## Increment 9: stress and resilience evidence

Status: awaiting review.

Angle A: run k6 against the local service set first, then repeat against the selected deployment shape.

Angle B: run only a deployment stress test and use local tests for correctness.

Selection recorded by this design: Angle A.

Reason: local repeatability exposes invariant failures before deployment cost.

Planned verification: throughput, latency percentiles, error rate, failure injection, recovery time, event-order permutations, release replay, and every invariant in `docs/testing-strategy.md`.

Open choice: select the live storefront wording for the case where public remaining reaches zero while the Valkey pool still has claimable slots. Checkout uses the Valkey pool as the sold-out authority.

## Change log

### 2026-09-22

- Added reviewable implementation increments and two angles for each feature increment.
- Separated mock payment-page work from unified reconciliation and exact-once release work.
- Clarified the Express SQS worker and best-effort payment-session retry.

### 2026-09-23

- Added active-owner indexes, cancellation retry, and slot-reallocation recovery checks.
- Recorded the known Valkey pop-to-SQS crash gap and removed durable replay from the plan.
- Selected CloudFront-to-API-Gateway checkout with a Better Auth session authorizer in `packages/checkout-authorizer`.
- Selected Valkey secondary storage for Better Auth sessions and API Gateway REST REQUEST authorization.
- Added cookie-scope, conditional CORS, preflight, and session-cleanup checks.
- Recorded `stockTotal`, `reserveSlots`, `publicStock`, one-pool seeding and claims, and the unresolved live-stock display wording.
- Selected contract-first OpenAPI YAML and added the increment 1 bootstrap scope.
- Completed the email/password authentication slice of Increment 2. Listing setup remains pending.
