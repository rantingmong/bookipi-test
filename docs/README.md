# docs

## Purpose

This directory contains the current design record for the flash-sale system.

## Flow

Read [system-design.md](system-design.md) for the architecture and contracts.

Read [testing-strategy.md](testing-strategy.md) for test layers, invariants, and acceptance criteria.

Read [implementation-roadmap.md](implementation-roadmap.md) for reviewable increments and implementation choices.

Update the affected document when a decision or boundary changes.

## Decisions & assumptions

- `system-design.md` is the source for the current architecture and API drafts.
- `testing-strategy.md` defines planned verification, not completed results.
- `implementation-roadmap.md` records the order of work and the choice required for each feature increment.
- Current guidance stays in document bodies.
- Dated historical facts stay in each document `Change log` section.

## Gotchas

No document proves that a runtime exists.

No document contains benchmark results for this design-only increment.

Mermaid diagrams describe the plan and require validation when the related runtime work starts.

## Change log

### 2026-09-22

- Added the design-document map and update rules.
- Added the mock payment and unified reconciliation design scope.
- Added payment binding, terminal-winner, and Express worker corrections.

### 2026-09-23

- Added mock-session security, Valkey recovery, and cancelled-payment retry guidance.
