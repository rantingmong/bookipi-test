# packages

## Purpose

This directory contains the planned runtime packages for the flash-sale system.

## Flow

The storefront sends user actions to the backend.

The backend protects the purchase endpoint and invokes the checkout processor.

The checkout processor creates an order identifier, reserves inventory in Valkey, then publishes an event to SQS and starts a mocked payment session.

The backend consumes the event and writes durable order facts to MongoDB.

The payment callback sends payment facts to the same backend state-transition function.

The backend records the completed sale in MongoDB and releases cancelled slots once.

The callback transaction records a pending release intent with `CANCELLED`. An Express worker retries each guarded release.

A cancelled customer can start a new checkout with a new idempotency key.

The Express SQS worker long-polls the queue directly.

Standard SQS can duplicate and reorder events. The worker processes them idempotently.

## Decisions & assumptions

- `backend` owns Express API behavior, Better Auth, listing setup, status reads, durable persistence, and event-driven order reconciliation.
- `storefront` owns the Next.js user interface.
- `checkout-processor` owns Lambda order creation, the hot path for reservation, SQS publication, and mock payment-session creation.
- `backend` owns the Express SQS worker, unified order transition, and pending slot-release worker.
- All packages use TypeScript and ECMAScript modules.
- Package manifests contain metadata only in design increment 0.

## Gotchas

No package has source code or dependencies yet.

Do not add package scripts until the related runtime exists and its command is verified.

Read each package README before changing that package.

## Change log

### 2026-09-22

- Added the package boundary map for design increment 0.
- Added payment fact and unified reconciliation boundaries.
- Clarified the Express SQS worker and terminal-state ownership.

### 2026-09-23

- Added the new-checkout-after-cancellation package boundary.
- Clarified the best-effort Valkey-to-SQS path and its crash gap.
- Added the durable cancellation release worker and immutable payment outcome rule.
