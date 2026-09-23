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

Read [implementation-roadmap.md](implementation-roadmap.md) for reviewable increments and implementation choices.

Update the affected document when a decision or boundary changes.

## Decisions & assumptions

- `system-design.md` is the short source for the master flow and facet map.
- The facet documents hold detailed architecture decisions and contracts.
- `testing-strategy.md` defines planned verification, not completed results.
- `implementation-roadmap.md` records the order of work and the choice required for each feature increment.
- Current guidance stays in document bodies.
- Dated historical facts stay in each document `Change log` section.

## Gotchas

No document proves that a runtime exists.

No document contains benchmark results for this design-only increment.

Mermaid diagrams describe the plan and require validation when the related runtime work starts.

The deployed purchase path is CloudFront to an API Gateway REST API to the checkout Lambda. A REQUEST Lambda authorizer reads Better Auth sessions from Valkey. Express does not proxy the purchase request or invoke Lambda.

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
