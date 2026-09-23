# docs

## Purpose

This directory contains the current design record for the flash-sale system.

## Flow

Read [system-design.md](system-design.md) for the master flow and facet map.

Read the relevant facet for detailed design decisions:

- [listing-and-inventory.md](listing-and-inventory.md) for listing publication and inventory ownership.
- [checkout.md](checkout.md) for the deployed purchase path and reservation rules.
- [orders.md](orders.md) for durable order facts and state transitions.
- [payments.md](payments.md) for mock sessions, callbacks, and slot release.
- [identity-and-access.md](identity-and-access.md) for trust boundaries and the selected API Gateway authorizer.
- [reliability.md](reliability.md) for failures, recovery limits, and observability.

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

The deployed purchase path is CloudFront to API Gateway to the checkout Lambda. Express does not proxy that request or invoke Lambda.

## Change log

### 2026-09-22

- Added the design-document map and update rules.
- Added the mock payment and unified reconciliation design scope.
- Added payment binding, terminal-winner, and Express worker corrections.

### 2026-09-23

- Added mock-session security, Valkey recovery, and cancelled-payment retry guidance.
- Split detailed design decisions into focused facet documents.
- Corrected the deployed checkout request path and selected the Better Auth session authorizer.
