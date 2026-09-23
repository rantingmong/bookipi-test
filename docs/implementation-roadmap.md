# Implementation roadmap

## Purpose

This roadmap divides the flash-sale system into small increments that a user can review.

Each feature increment lists two implementation angles before a choice.

## Flow

Complete one increment, verify it, review its evidence, and then select the next increment.

Keep runtime changes inside the selected increment.

Update the affected README and design document when a decision changes.

## Decisions & assumptions

- Increment 0 is the current design-only increment.
- The selected stack remains pnpm, TypeScript, Express, Next.js, Lambda, MongoDB, Valkey, and LocalStack.
- Each future feature needs a user review before implementation if its angles change behavior or system boundaries.
- No feature increment is implemented in this worktree yet.

## Increment 0: repository shell and design record

Status: selected and documented.

Create repository rules, package metadata, package context READMEs, design documents, and test plans.

Angle A: write the complete design record before runtime code.

Angle B: start with a minimal API and infer the design from code.

Selection: Angle A.

Reason: the take-home requires explicit trade-offs, failure paths, diagrams, and staged work.

Verification: JSON parsing, Markdown link checks, Mermaid syntax review, `git diff --check`, and worktree status.

## Increment 1: repository bootstrap and shared contracts

Status: awaiting review.

Angle A: define TypeScript contracts and validation first, then add package tooling.

Angle B: add service bootstraps first, then derive contracts from route handlers.

The review must choose the contract and package boundaries before code starts.

Planned verification: package metadata validation, TypeScript checks, and contract unit tests.

## Increment 2: Better Auth and listing setup

Status: awaiting review.

Angle A: keep Better Auth, listing creation, and seed orchestration in Express.

Angle B: isolate authentication or listing setup into separate services.

Selection recorded by this design: Angle A.

Reason: one backend boundary reduces coordination for the small take-home while keeping the hot path in Lambda.

Planned verification: authenticated route tests, MongoDB adapter tests, listing-slot uniqueness, and seed verification.

## Increment 3: Valkey seed and sale status

Status: awaiting review.

Angle A: seed Valkey synchronously and publish only after verification.

Angle B: publish first and repair the availability list with an asynchronous job.

Selection recorded by this design: Angle A.

Reason: a failed seed must fail closed instead of exposing a partially available sale.

Planned verification: seed counts, publication state, sale-window boundaries, and status reads.

## Increment 4: checkout reservation and SQS publication

Status: awaiting review.

Angle A: Lambda owns atomic Valkey reservation and SQS publication.

Angle B: Express owns atomic reservation and Lambda only consumes an event.

Angle B would make an SQS message an intent, not a reservation. A consumer must claim a slot atomically before the API can confirm the purchase.

Selection recorded by this design: Angle A.

Reason: the hot path stays close to Valkey and scales independently from durable reads and writes.

Planned verification: concurrent requests, no overselling, one item per user, stable `orderId` for the same key while Valkey state remains, best-effort publish retry, duplicate SQS delivery, and the documented crash gap after the Valkey pop.

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

Selection recorded by this design: Angle A.

Reason: the page exercises the same callback rules without exposing the service-authenticated callback route or adding a second local service.

Planned verification: mock session correlation, success, failure, expiry, callback replay, and page access control.

## Increment 7: unified order reconciliation and durable slot release

Status: awaiting review.

Angle A: send SQS and payment facts to one reconciliation and state-transition function. Store a release intent with `CANCELLED`, then let an Express worker run the guarded Valkey release.

Angle B: keep separate SQS and payment state machines and merge their results in a periodic batch job.

Selection recorded by this design: Angle A.

Reason: one transition function makes event order and terminal-state rules explicit.

Planned verification: both event orders, conflicting payment outcomes in both arrival orders, success before SQS followed by expiry, duplicate events, terminal transitions, atomic cancellation and release intent, worker retry after crashes, new checkout after cancellation, compare-and-delete release, active partial-index rejection, old release replay after slot reallocation, and final `listing-slot.orderId` ownership.

## Increment 8: storefront purchase experience

Status: awaiting review.

Angle A: let the Next.js storefront call the Express API directly.

Angle B: add a Next.js backend-for-frontend route that proxies Express.

The review must choose the client boundary after the API contract stabilizes.

Planned verification: Playwright sign-in, status, purchase, retry, mock payment, result, and access-control flows.

## Increment 9: stress and resilience evidence

Status: awaiting review.

Angle A: run k6 against the local service set first, then repeat against the selected deployment shape.

Angle B: run only a deployment stress test and use local tests for correctness.

Selection recorded by this design: Angle A.

Reason: local repeatability exposes invariant failures before deployment cost.

Planned verification: throughput, latency percentiles, error rate, failure injection, recovery time, event-order permutations, release replay, and every invariant in `docs/testing-strategy.md`.

## Change log

### 2026-09-22

- Added reviewable implementation increments and two angles for each feature increment.
- Separated mock payment-page work from unified reconciliation and exact-once release work.
- Clarified the Express SQS worker and best-effort payment-session retry.

### 2026-09-23

- Added active-owner indexes, cancellation retry, and slot-reallocation recovery checks.
- Recorded the known Valkey pop-to-SQS crash gap and removed durable replay from the plan.
