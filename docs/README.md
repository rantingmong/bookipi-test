# docs

## Purpose

This directory contains the current design record for the flash-sale system.

## Flow

Read [system-design.md](system-design.md) for the master flow and facet map.

Read the relevant facet for detailed design decisions:

- [listing-and-inventory.md](listing-and-inventory.md) for listing publication and inventory ownership.
- [checkout.md](checkout.md) for the deployed purchase path and reservation rules.
- [orders.md](orders.md) for durable order facts and state transitions.
- [payments.md](payments.md) for mock sessions, callbacks, and slot reallocation after order cancellation.
- [identity-and-access.md](identity-and-access.md) for trust boundaries and the selected API Gateway REST REQUEST authorizer.
- [reliability.md](reliability.md) for failures, recovery limits, possible mitigations, and observability.

Each facet uses short sequence diagrams for one business stage. Read the prose for security rules, retries, and recovery limits. The diagrams omit CORS preflight and routine request exchanges.

Read [testing-strategy.md](testing-strategy.md) for test layers, invariants, and acceptance criteria.

Read [local-k6-benchmark-2026-09-25.md](local-k6-benchmark-2026-09-25.md) for local checkout benchmark results and their limits.

Read [implementation-roadmap.md](implementation-roadmap.md) for reviewable increments and implementation choices.

Read [../infra/README.md](../infra/README.md) for the local Caddy and LocalStack test stack. It describes local checks and their limits.

Update the affected document when a decision or boundary changes.

## Decisions & assumptions

- `system-design.md` is the short source for the master flow and facet map.
- The facet documents hold detailed architecture decisions and contracts.
- `testing-strategy.md` defines current test evidence and planned verification.
- `implementation-roadmap.md` records the order of work and the choice required for each feature increment.
- Current guidance stays in document bodies.
- Dated historical facts stay in each document `Change log` section.

## Gotchas

The local benchmark does not prove deployed AWS, CloudFront, or production behavior.

Mermaid diagrams describe the plan and require validation when the related runtime work starts.

The deployed purchase path is CloudFront to an API Gateway REST API to the checkout Lambda. A separate REQUEST Lambda authorizer reads Better Auth sessions from Valkey. Express does not proxy the purchase request or invoke Lambda. The local test stack uses Caddy as an edge substitute and LocalStack for API Gateway, Lambda, and SQS. The LocalStack `2026.8.4` Hobby prototype did not invoke or enforce the REQUEST authorizer. The local stack uses a combined auth adapter in the checkout processor Lambda. This workaround does not prove deployed CloudFront, AWS, or REQUEST-authorizer behavior.

## Change log

### 2026-09-22

- Added the design-document map and update rules.
- Added the mock payment and unified reconciliation design scope.
- Added payment binding, terminal-winner, and Express worker corrections.

### 2026-09-23

- Added mock-session security, Valkey recovery, and cancelled-payment retry guidance.
- Split detailed design decisions into focused facet documents.
- Corrected the deployed checkout request path and selected the Better Auth session authorizer.
- Moved Better Auth sessions to Valkey and changed the checkout authorizer to API Gateway REST REQUEST.
- Split facet sequence diagrams by business stage and removed preflight exchanges.
- Named the cancellation flow slot reallocation after order cancellation without changing release marker names.
- Linked the reliability facet's current and future mitigation notes.

### 2026-09-25

- Added local k6 checkout benchmark results and their limits.
