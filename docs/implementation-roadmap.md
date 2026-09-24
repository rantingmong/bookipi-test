# Implementation roadmap

## Purpose

This roadmap divides the flash-sale system into small increments that a user can review.

Each feature increment lists two implementation angles before a choice.

## Flow

Complete one increment, verify it, review its evidence, and then select the next increment.

Keep runtime changes inside the selected increment.

Update the affected README and design document when a decision changes.

## Decisions & assumptions

- Increment 0 records the system design. Increment 1 is complete. The authentication and durable listing/order model foundation slices of Increment 2 are complete. Listing publication and sale routes remain pending.
- The selected stack remains pnpm, TypeScript, Express, Next.js static export, CloudFront, API Gateway, Lambda, MongoDB, Valkey, and LocalStack.
- API Gateway REST API uses `packages/checkout-authorizer` for its separate REQUEST Lambda authorizer. It checks Better Auth sessions in Valkey.
- Each future feature needs a user review before implementation if its angles change behavior or system boundaries.
- Increment 1 provides the first runtime bootstrap. Increment 2 adds authentication and the durable listing/order model foundation. Listing publication and sale behavior remain planned.

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

Status: authentication and durable listing/order model foundation complete; listing publication remains pending.

Angle A: keep Better Auth, listing creation, and seed orchestration in Express. Store Better Auth users and credentials in MongoDB, and sessions in Valkey secondary storage.

Angle B: isolate authentication or listing setup into separate services.

Selection recorded by this design: Angle A with Valkey secondary storage for sessions and MongoDB for users and credentials. This increment implements email/password sign-up, login, session display, and sign-out. It also validates listing setup, transactionally creates and extends durable listing slots, defines the minimal durable order model, and provides a deterministic listing seed command. Listing publication, Valkey state, admin behavior, sale routes, order transitions, and order seeding remain planned.

Reason: one backend boundary reduces coordination for the small take-home while keeping the hot path in Lambda.

Authentication verification: focused tests cover required settings, storage selection, no MongoDB session fallback, session identity mapping, raw Express request ordering, and credentialed browser requests. Model tests cover listing validation, transactional slot creation and growth, order indexes, and repeat-safe listing seed writes. MongoDB and Valkey integration, cookie expiry, revocation, listing publication, and deployment authorizer checks remain pending. The separate authorizer makes no Express or MongoDB request.

Listing setup stores listing identity, display name, sale window, and `reserveSlots`. It accepts a positive integer `initialSlotCount` as an operation parameter and requires `initialSlotCount >= reserveSlots`. It stores no stock count. Derive `stockTotal` by counting slot documents and `publicStock = stockTotal - reserveSlots`.

## Increment 3: Valkey seed and sale status

Status: awaiting review.

Angle A: seed Valkey synchronously and publish only after verification.

Angle B: publish first and repair the availability list with an asynchronous job.

Selection recorded by this design: Angle A.

Reason: a failed seed must fail closed instead of exposing a partially available sale.

Planned verification: seed counts, publication state, sale-window boundaries, and status reads.

Seed every slot document into one Valkey pool. Verify examples: 15 total slots and 5 reserve gives public count 10; 10 total slots and 2 reserve gives public count 8. Verify that publication fails if the seed count does not equal the slot-document count.

## Increment 4: checkout reservation and SQS publication

Status: awaiting review.

Angle A: Lambda owns atomic Valkey reservation and SQS publication.

Angle B: Express owns atomic reservation and Lambda only consumes an event.

Angle B would make an SQS message an intent, not a reservation. A consumer must claim a slot atomically before the API can confirm the purchase.

Selection recorded by this design: Angle A.

Reason: the hot path stays close to Valkey and scales independently from durable reads and writes.

Planned verification: concurrent requests, no overselling, one item per user, stable `orderId` for the same `(listingId, trusted customerId, client idempotencyKey)` while Valkey state remains, cross-customer key isolation, best-effort publish retry, duplicate SQS delivery, and the documented crash gap after the Valkey pop.

The atomic claim pops any one slot from the shared pool. The reserve count does not route claims. Reject checkout as sold out only when Valkey has no claimable slots. At most as many orders can reach `COMPLETE` as there are slot documents. Verify ten customers can complete with ten slots and `reserveSlots: 2`, then verify an 11th customer receives a sold-out result while the sale remains active.

## Increment 5: durable reservation facts

Status: awaiting review.

Angle A: let the Express SQS worker upsert minimal order fields directly into MongoDB by `orderId`.

Angle B: store every SQS event in an event log before updating the order.

Selection recorded by this design: Angle A.

Reason: the selected path keeps the first implementation small while the unique `orderId` index makes event replay idempotent.

Planned verification: duplicate and reordered events, acknowledgement timing, durable order facts, and idempotent handling of Standard SQS delivery.

## Increment 6: mock payment session and page

Status: awaiting review.

Angle A: add a Next.js mock payment page with success and failure buttons. The page uses `orderId` after the SQS worker persists the order.

Angle B: run a separate local payment emulator and connect the storefront to its callback endpoint.

Selection recorded by this design: Angle A. Lambda creates `orderId` before the atomic Valkey claim. The SQS event carries `orderId`, `customerId`, `listingId`, and `slotId` to the Express worker. The page waits for MongoDB persistence before it shows owner-checked buttons.

Reason: the page uses the existing order identity without adding a second local service.

Planned verification: page pending state, success, failure, expiry, owner checks, and order reads by `orderId`. Provider callbacks remain outside this increment.

## Increment 7: unified order reconciliation and durable slot release

Status: awaiting review.

Angle A: apply payment outcomes to the order status after the SQS worker persists the order. Use `orderId` as the slot owner and return a cancelled slot through a guarded Valkey release.

Angle B: keep separate SQS and payment state machines and merge their results in a periodic batch job.

Selection recorded by this design: Angle A.

Reason: order status and slot ownership use one stable order identifier.

Planned verification: duplicate SQS events, status transitions, cancellation release, worker retry after crashes, new checkout after cancellation, active partial-index rejection, and `orderId` slot ownership. Provider callback correlation and reconciliation remain deferred.

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
- Added the durable listing/order model foundation and deterministic listing seed. Listing publication remains pending.
