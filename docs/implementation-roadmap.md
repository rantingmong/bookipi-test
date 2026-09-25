# Implementation roadmap

## Purpose

This roadmap divides the flash-sale system into small increments that a user can review.

Each feature increment lists two implementation angles before a choice.

## Flow

Complete one increment, verify it, review its evidence, and then select the next increment.

Keep runtime changes inside the selected increment.

Update the affected README and design document when a decision changes.

## Decisions & assumptions

- Increment 0 records the system design.
- Increment 1 is complete.
- Increment 2 implementation and focused verification are complete. Integration evidence remains pending.
- Increment 3 implements listing publication and inventory methods. Sale routes remain planned.
- Increment 4 implementation, local verification, and internal reviews are complete. Integration and deployment evidence remain pending.
- Increment 5 implementation and local verification are complete. AWS SQS and MongoDB integration evidence remain pending.
- The deployed stack uses CloudFront, API Gateway, Lambda, MongoDB, and Valkey. The local test stack uses Caddy as a same-origin edge and LocalStack for API Gateway, Lambda, and SQS.
- The production API Gateway REST API uses `packages/checkout-authorizer` for its separate REQUEST Lambda authorizer. It checks Better Auth sessions in Valkey. The LocalStack Hobby template uses a local-only combined adapter because its isolated `2026.8.4` prototype did not invoke or enforce a REQUEST authorizer.
- Each future feature needs a user review before implementation if its angles change behavior or system boundaries.
- Increment 1 provides the first runtime bootstrap. Increment 2 adds authentication and the durable listing/order model foundation. Increment 3 adds listing publication and inventory methods. Sale routes remain planned.

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

Status: implementation and focused verification complete; integration evidence remains pending.

Angle A: keep Better Auth, listing creation, and seed orchestration in Express. Store Better Auth users and credentials in MongoDB, and sessions in Valkey secondary storage.

Angle B: isolate authentication or listing setup into separate services.

Selection recorded by this design: Angle A with Valkey secondary storage for sessions and MongoDB for users and credentials. This increment implements email/password sign-up, login, session display, and sign-out. It also validates listing setup, transactionally creates and extends durable listing slots, defines the minimal durable order model, and provides a deterministic listing seed command. Increment 3 adds listing publication and Valkey state. Admin behavior, sale routes, order transitions, and order seeding remain planned.

Reason: one backend boundary reduces coordination for the small take-home while keeping the hot path in Lambda.

Authentication verification: focused tests cover required settings, storage selection, no MongoDB session fallback, session identity mapping, raw Express request ordering, and credentialed browser requests. Model tests cover listing validation, transactional slot creation and growth, and order indexes. Increment 3 changes the demo seed to call `createListing`; identical facts and state succeed idempotently, while conflicting facts or inconsistent existing state fail closed. MongoDB integration, cookie expiry, revocation, sale reads, and deployment authorizer checks remain pending. The separate authorizer makes no Express or MongoDB request.

Listing setup stores listing identity, display name, sale window, and `reserveSlots`. It accepts a positive integer `initialSlotCount` as an operation parameter and requires `initialSlotCount >= reserveSlots`. It stores no stock count. Derive `stockTotal` by counting slot documents and `publicStock = stockTotal - reserveSlots`.

## Increment 3: Valkey seed and sale status

Status: implemented as listing creation publication and inventory methods. Sale status reads remain planned.

Angle A: seed Valkey synchronously and publish only after verification.

Angle B: publish first and repair the availability list with an asynchronous job.

Selection recorded by this design: Angle A.

Reason: a failed seed must fail closed instead of exposing a partially available sale.

Verification: focused tests cover seed counts, publication state, sale-window checks, atomic slot claims, and guarded release. A local Valkey smoke check covers seed, unique claims, sold out, release, and reclaim. MongoDB integration and status reads remain planned.

Seed every slot document into one Valkey pool. Verify examples: 15 total slots and 5 reserve gives public count 10; 10 total slots and 2 reserve gives public count 8. Verify that publication fails if the seed count does not equal the slot-document count.

This increment also adds the first checkout-processor feature: an atomic slot pop that binds a slot to `orderId`. The backend listing feature provides a guarded release method. A future worker must confirm durable cancellation before it calls that method.

## Increment 4: checkout request and SQS publication

Status: implementation, local verification, and internal reviews complete; integration and deployment evidence remain pending.

Angle A: Lambda owns atomic Valkey reservation and SQS publication.

Angle B: Express owns atomic reservation and Lambda only consumes an event.

Angle B would make an SQS message an intent, not a reservation. A consumer must claim a slot atomically before the API can confirm the purchase.

Selection recorded by this design: Angle A.

Reason: the hot path stays close to Valkey and scales independently from durable reads and writes.

Unit verification covers request validation, trusted identity, atomic claim outcomes, stable same-key binding, best-effort publish retry, and the `order-reserved.v1` event shape. Valkey concurrency, no-oversell behavior, duplicate delivery, LocalStack publication, deployment, and the documented crash gap still need integration or deployment evidence.

The atomic claim pops any one slot from the shared pool. The reserve count does not route claims. Reject checkout as sold out only when Valkey has no claimable slots. At most as many orders can reach `COMPLETE` as there are slot documents. Verify ten customers can complete with ten slots and `reserveSlots: 2`, then verify an 11th customer receives a sold-out result while the sale remains active.

## Increment 5: durable reservation facts

Status: implemented and locally verified. AWS SQS and MongoDB integration evidence remain pending.

Angle A: let the Express SQS worker upsert minimal order fields directly into MongoDB by `orderId`.

Angle B: store every SQS event in an event log before updating the order.

Selection recorded by this design: Angle A.

Reason: the selected path keeps the first implementation small while the unique `orderId` index makes event replay idempotent.

Unit verification covers worker settings, strict event validation, SQS long polling and acknowledgement commands, idempotent order upsert, terminal-status preservation, and conflict rejection. AWS SQS delivery, MongoDB persistence before acknowledgement, retry, and dead-letter behavior remain pending integration or deployment checks.

The worker long-polls SQS directly. It stores `orderId`, `customerId`, `listingId`, and `slotId` as immutable reservation facts, then acknowledges the message. It does not reset an existing order status. A conflicting event stays unacknowledged for queue redrive handling.

## Increment 6: mock payment session and page

Status: implemented and locally verified. Browser, MongoDB, SQS, and deployment evidence remain pending.

Angle A: add a Next.js mock payment page with success and failure buttons, and create its payment redirect in the checkout processor after SQS accepts reservation facts. The page uses `orderId` after the SQS worker persists the order.

Angle B: run a separate local payment emulator and connect the storefront to its callback endpoint.

Selection recorded by this design: Angle A. Lambda creates `orderId` before the atomic Valkey claim. The SQS event carries `orderId`, `customerId`, `listingId`, and `slotId` to the Express worker. After SQS accepts the event, the payment feature returns the relative `/payment?orderId=<encoded id>` redirect. The page waits for MongoDB persistence before it shows owner-checked buttons. The backend payment feature owns the outcome transition.

Reason: the page uses the existing order identity without adding a second local service.

Local verification covers API generation, order reads, owner checks, route availability when order routes are configured, payment redirect creation, success, failure, expiry, same-terminal-status retries, conflicting outcomes, the storefront client wrapper, type checks, package tests, static export, formatting, and diff checks. Provider callbacks remain outside this increment.

## Increment 7: unified order reconciliation and durable slot release

Status: implemented and locally verified. MongoDB and Valkey integration evidence remains pending.

Angle A: apply payment outcomes to the order status after the SQS worker persists the order. Use `orderId` as the slot owner and return a cancelled slot through a guarded Valkey release.

Angle B: keep separate SQS and payment state machines and merge their results in a periodic batch job.

Selection recorded by this design: Angle A.

Reason: order status and slot ownership use one stable order identifier.

Local verification covers duplicate SQS events, status transitions, cancellation release intents, trigger-driven reconciliation after SQS and payment outcomes, and marker idempotency. MongoDB and Valkey integration must still verify ownership, duplicate release, new checkout after cancellation, and active partial-index behavior. There is no background release sweep. SQS retries when reconciliation fails before acknowledgement. A payment caller must retry a failed or interrupted outcome request. Provider callback correlation and reconciliation remain deferred.

## Increment 8: storefront purchase experience

Status: implemented. The local integration suite checks storefront delivery, backend health, sign-up, session cookies, API Gateway checkout, the local combined authentication adapter, SQS persistence, and owner payment. The [REQUEST-authorizer prototype](../infra/localstack/prototypes/rest-request-authorizer/) records that LocalStack `2026.8.4` Hobby did not invoke or enforce the configured authorizer. Deployed CloudFront and AWS checks remain pending.

Angle A: let the browser call the configured deployed CloudFront checkout endpoint directly. CloudFront routes to API Gateway REST API, whose REQUEST Lambda authorizer checks the Better Auth session in Valkey before checkout Lambda runs.

Angle B: add a Next.js backend-for-frontend route that proxies the CloudFront checkout endpoint.

Selection recorded by this design: Angle A.

Reason: the purchase request must bypass Express. The direct path has fewer request hops and keeps the hot path in API Gateway and Lambda.

Local verification: backend tests cover public listing status and durable counts. Authorizer tests cover the production handler's missing and unapproved Origin rejection before runtime access, session options, and deny paths. Processor tests cover the local adapter's origin-first authentication, trusted identity replacement, no-store behavior, and safe failure response. Storefront tests cover listing reads and direct checkout request shape. A controlled Playwright test verifies session and listing display, direct request fields, cookie forwarding, same-key retry, and payment-page navigation.

Deployment verification remains required. Check CloudFront routing, cookie and Origin forwarding, disabled checkout response caching, disabled API Gateway authorizer-result caching, the deployed authorizer against Valkey, and cookie scope. If origins differ, check credentialed CORS on success and relevant errors. Check an unauthenticated API Gateway `OPTIONS` method that does not invoke checkout. Local Caddy and LocalStack do not prove these behaviors.

## Increment 9: stress and resilience evidence

Status: awaiting review.

Angle A: run k6 against the local service set first, then repeat against the selected deployment shape.

Angle B: run only a deployment stress test and use local tests for correctness.

Selection recorded by this design: Angle A.

Reason: local repeatability exposes invariant failures before deployment cost.

Planned verification: throughput, latency percentiles, error rate, failure injection, recovery time, event-order permutations, release replay, and every invariant in `docs/testing-strategy.md`.

Open choice: select the live storefront wording for the case where public remaining reaches zero while the Valkey pool still has claimable slots. Checkout uses the Valkey pool as the sold-out authority.

## Increment 10: local full-stack test infrastructure

Status: implemented. Run the local suite to record integration evidence. Deployed AWS checks remain pending.

Angle A: use Caddy as a same-origin local edge and LocalStack for REST API Gateway, Lambda, and SQS.

Angle B: use LocalStack CloudFront as the local browser edge.

Selection: Angle A.

Reason: LocalStack Hobby supports the required API Gateway, Lambda, and SQS services. Its CloudFront support requires a higher plan. Caddy keeps auth and checkout on one browser origin.

The local stack uses Compose services in `infra/compose.yml`, Lambda artifacts in `.artifacts/lambdas`, and the CloudFormation template in `infra/localstack/template.yaml`. The integration runner reads `.localstack` without printing the token, creates a per-run auth secret and sale window, and runs its checks after cleanup in a `finally` path.

Local verification checks storefront delivery, backend health, sign-up and session cookies, the authorizer and checkout Lambda, SQS-to-MongoDB persistence, owner order reads, and the payment outcome. These checks do not prove CloudFront, deployed API Gateway, deployed Lambda, or production IAM behavior.

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

### 2026-09-24

- Implemented increment 4 request handling, scoped Valkey reservation, and SQS publication. Integration and deployment evidence remain pending.
- Corrected the Increment 2 and Increment 4 status summaries after local verification and review.
- Implemented the Increment 5 Express SQS worker and immutable order persistence. AWS SQS and MongoDB integration evidence remain pending.
- Implemented Increment 6 with the static mock payment page, authenticated order reads, a post-SQS relative payment redirect, and local or test payment outcomes. Browser, MongoDB, SQS, and deployment evidence remain pending.

### 2026-09-25

- Added the Caddy and LocalStack local full-stack test increment. Deployed CloudFront and AWS behavior remain unverified.
