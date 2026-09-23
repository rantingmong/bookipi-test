# Bookipi flash-sale

## Purpose

This repository is design increment 0 for a high-throughput Bookipi flash-sale system.

The source requirements define one configurable sale, one product, limited stock, one item per user, purchase status, purchase results, a React frontend, high throughput, resilience, no overselling, unit and integration tests, stress tests, a system diagram, and implementation documentation.

This increment creates the repository shell and the design record.

No runtime exists yet.

## Flow

The planned system uses a Next.js storefront, an Express and Node API, CloudFront, API Gateway, an AWS Lambda checkout processor, MongoDB, Valkey, and LocalStack for local Lambda and SQS work.

Express creates a listing and durable `listing-slot` records in MongoDB.

Express seeds a Valkey availability list and publishes the listing only after seed verification.

The browser sends a purchase request directly to the configured CloudFront checkout endpoint. CloudFront routes the request through API Gateway to the checkout Lambda. Express never invokes Lambda and never proxies the purchase request.

An API Gateway Lambda authorizer validates the Better Auth session, including cookie integrity and expiry, and uses its MongoDB-backed session lookup. It passes trusted `customerId` to Lambda. The Lambda ignores browser-supplied `customerId` values. CloudFront forwards the session cookie and does not cache checkout responses.

For cookie-authenticated checkout POST requests, the authorizer also requires an approved `Origin` and rejects missing or unapproved values. Deployment configuration supplies the exact storefront origin allowlist.

The Lambda generates the authoritative `orderId`, atomically reserves one Valkey slot, and publishes an order-reserved event to Standard SQS. After SQS accepts the event, Lambda creates or reuses the mock payment session through a service-authenticated internal Express endpoint.

The Express SQS worker long-polls SQS and idempotently upserts order facts into MongoDB.

The payment callback can arrive before or after the SQS event.

One event-driven reconciliation function combines both fact paths and records completed sales in MongoDB.

The first valid payment outcome wins. A cancellation and its pending release intent commit together. An Express worker retries the guarded Valkey release.

The design has no durable replay for a Lambda crash after the Valkey pop and before SQS accepts the event.

## Decisions & assumptions

The package map is:

- `packages/backend`: Express API, Better Auth, listing setup, reads, Express SQS worker, and order reconciliation.
- `packages/storefront`: Next.js browser experience.
- `packages/checkout-processor`: AWS Lambda order creation, hot-path reservation, SQS publication, and mock payment-session creation.
- `docs`: master flow, design facets, test strategy, and implementation roadmap.

The system uses pnpm, Node.js 24, TypeScript, and ECMAScript modules.

MongoDB stores Better Auth records and business data.

Valkey provides temporary real-time inventory arbitration during the sale.

SQS transports events and is never the only order copy.

The logical idempotency key is `(listingId, trusted customerId, client idempotencyKey)`. The same customer and listing reuse one reservation while Valkey retains its state. Another customer or listing cannot reuse that binding.

Standard SQS provides at-least-once delivery and can reorder messages. The worker handles duplicate and out-of-order events by event and order identity.

MongoDB is the final persistence layer for completed sales and durable order facts.

The checkout Lambda owns initial logical order creation and generates the authoritative `orderId`.

The payment processor is mocked initially.

A future storefront page provides success and failure buttons. It calls an owner-checked mock outcome route, and Express calls the shared callback handler.

The mock outcome route requires the authenticated order owner and a local or test-only flag.

The provider-shaped mock callback route requires service authentication. The browser cannot call it.

The initial purchase quantity is exactly one.

Only completed purchases enforce one item per customer and listing.

A failed or expired payment releases the slot for a new checkout with a new idempotency key.

Real payment-provider integration is outside this take-home scope.

The separate API Gateway authorizer will use one of the existing packages. The package placement remains an implementation choice.

Read the design documents before runtime implementation.

## Gotchas

This increment has no source directories, dependencies, lockfile, Docker files, runtime configuration, generated diagrams, API server, storefront server, Lambda package, mock payment page, or local service.

The planned local URLs are not available.

A crash or Valkey loss after the slot pop and before SQS publication can leave no queued order event. The design provides no durable replay for this gap and fails closed when slot ownership is unclear.

The repository has not performed external publication.

Do not report benchmark results before a stress test produces them.

Commands in this README must work with this design-only increment.

### Navigation

- [Repository rules](AGENTS.md)
- [Package map](packages/README.md)
- [Backend plan](packages/backend/README.md)
- [Storefront plan](packages/storefront/README.md)
- [Checkout processor plan](packages/checkout-processor/README.md)
- [Document map](docs/README.md)
- [System design entry point](docs/system-design.md)
- [Listing and inventory](docs/listing-and-inventory.md)
- [Checkout](docs/checkout.md)
- [Orders](docs/orders.md)
- [Payments](docs/payments.md)
- [Identity and access](docs/identity-and-access.md)
- [Reliability](docs/reliability.md)
- [Testing strategy](docs/testing-strategy.md)
- [Implementation roadmap](docs/implementation-roadmap.md)

### Commands that work now

```sh
node --version
pnpm --version
git status --short --branch
git diff --check
```

These commands inspect the current design-only repository.

No install, build, test, dev-server, deployment, or stress-test command exists yet.

## Change log

### 2026-09-22

- Created design increment 0 with the repository shell and design documents.
- Recorded Lambda order creation, mocked payment callbacks, and unified order reconciliation.
- Clarified payment-session binding, Express SQS consumption, and terminal-state recovery.

### 2026-09-23

- Added mock-session security, Valkey rebuild recovery, and cancelled-payment retry behavior.
- Clarified best-effort SQS retry and the known Valkey pop-to-SQS crash gap.
- Clarified first-outcome payment rules, durable release intents, and callback route authentication.
