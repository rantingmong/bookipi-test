# backend

## Purpose

The backend provides the Express API, Better Auth email/password access, durable listing and slot models, and a durable order model. The models do not provide an admin API or sale routes.

## Runtime

`src/server.ts` connects MongoDB and Valkey, registers the business models, waits for their indexes, builds the Better Auth app, and starts the Express API. Startup failures close MongoDB and Valkey. `src/app.ts` mounts Better Auth at `/api/auth/*splat` before JSON parsing. The API also exposes `GET /api/system/health`.

`pnpm dev` runs `node --conditions=development --import tsx --watch src/server.ts` on port `3001`. `pnpm build` runs `tsc -p tsconfig.json`. `pnpm start` runs `node dist/server.js`.

The server registers the listing, slot, and order models before it listens. It waits for their indexes to initialize. The seed command waits for listing and slot indexes before it writes data.

The environment feature validates startup settings in `src/features/env`. The auth feature owns authentication behavior and session identity mapping in `src/features/auth`. The MongoDB service uses one Mongoose connection and exposes its native MongoDB client and database to Better Auth. The MongoDB and Valkey clients live in `src/services`.

Set `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET`, `MONGODB_URI`, `MONGODB_DATABASE`, and `VALKEY_URL`. Set `STOREFRONT_ORIGIN` when the storefront uses a different origin. Better Auth stores users and credentials in MongoDB and sessions in Valkey secondary storage under `bookipi:auth:`. Sessions do not fall back to MongoDB.

Run `pnpm generate:api` before you start the backend in development. The root `typecheck`, `test`, and `build` scripts generate API code first.

The root OpenAPI file lists group configuration files. Each group file lists endpoint contracts in `x-endpoints`. Each endpoint file defines one operation. Run `pnpm generate:api` from the repository root to build ignored schemas, routers, handler bindings, and the browser client.

Keep each endpoint's `openapi.yml` beside its tracked `handler.ts`. Each API group has an `openapi.yml` and `router.ts`. Put domain logic in `src/features/<name>` and external integrations in `src/services/<name>`. Use `schema.ts` for external Zod schemas, `constants.ts` for internal constants, `types.ts` for internal types, and `models.ts` for Mongoose models.

The generator clears generated output before it runs. Keep API business logic in tracked endpoint `handler.ts` files. Keep authentication behavior in `src/features/auth`.

Set `STOREFRONT_ORIGIN` to one exact origin when the browser app uses a different origin. The API adds CORS headers for that origin and handles its preflight requests. It rejects unmatched preflight requests. Leave the setting unset for same-origin use. Do not use `*` or a URL path.

## Tests

Use test-driven development for backend changes. Add a focused test first and run it to confirm that it fails for the expected reason. Then make the smallest change and rerun the focused test and full backend test suite. Run `pnpm generate:api` first when the change depends on generated API files.

## Listing and order models

The listing feature validates listing identity, display name, sale window, `reserveSlots`, and an operation-level `initialSlotCount`. It stores no stock total. It creates the listing and its initial durable slots in one MongoDB transaction. Read and domain output counts the listing's slot documents and derives `publicStock = stockTotal - reserveSlots`.

The order model stores `orderId`, `customerId`, `listingId`, `slotId`, `status`, and timestamps. `orderId` identifies the checkout attempt and slot owner. Its statuses are `PENDING`, `COMPLETE`, and `CANCELLED`. Active partial indexes prevent a customer from holding two active orders for one listing and prevent two active orders from owning one listing slot.

The feature can add a positive integer number of slots to an existing listing. It preserves `reserveSlots` and the listing fields. It counts current slot documents, inserts only the next sequential slot IDs, and returns derived counts in one transaction. Concurrent additions serialize through a write to the listing timestamp. The unique `{ listingId, slotId }` index also rejects a duplicate slot ID.

Run `pnpm --filter @bookipi/backend seed` to upsert one deterministic listing with `reserveSlots: 2` and ten available slots. It derives 10 total slots and 8 public slots from slot data. It does not create an order or publish Valkey state. Set `MONGODB_URI` and `MONGODB_DATABASE` before you run it.

Use the `#app`, `#api/*`, `#features/*`, and `#services/*` imports for backend code. The package maps resolve TypeScript source during development and compiled JavaScript after build. Do not edit generated API output.

## Flow

Express will authenticate customers with Better Auth.

The listing feature creates listing metadata and initial `listing-slot` records in one transaction. It derives `stockTotal` from slot documents and `publicStock = stockTotal - reserveSlots`.

Listing publication will seed and verify one Valkey availability list with every slot before it publishes the listing.

Express will expose sale status and purchase result reads.

Express will not invoke Lambda or proxy the purchase request.

The browser will send purchase requests directly to the configured CloudFront checkout endpoint. CloudFront will route them through API Gateway to the checkout Lambda.

An API Gateway REST REQUEST Lambda authorizer will reject a missing or unapproved `Origin` before it calls Better Auth or reads Valkey. After the origin passes, it will check the Better Auth cookie with Better Auth semantics. It will use `getSession` with `disableRefresh: true` and `disableCookieCache: true`, then pass only trusted `customerId` to Lambda. It will not refresh an active session. Better Auth may still delete an expired session and return an expiry cookie that the authorizer cannot forward.

The client sends its `idempotencyKey`. The Lambda validates but does not change it. Valkey maps `(listingId, trusted customerId, idempotencyKey)` to `orderId` and `slotId`. A same-key retry returns or republishes that same binding.

The SQS event will contain `orderId`, `customerId`, `listingId`, and `slotId`. SQS is the only Lambda-to-Express bridge. The Express SQS worker will upsert the order by `orderId`. The unique `orderId` index makes duplicate delivery idempotent.

The mock payment page will wait for MongoDB persistence, then use `orderId`. Express will check its stored `customerId` before it enables owner-checked outcome buttons.

The worker will long-poll SQS directly. The selected design has no SQS-to-Lambda event source mapping.

The current order model stores `orderId`, `customerId`, `listingId`, `slotId`, and `status`. It does not store the client idempotency key. Payment callbacks, order transitions, and slot release remain planned.

A cancelled order keeps its original `(listingId, customerId, client idempotencyKey)` binding. A new client key can start a new checkout for that customer and listing.

The mock outcome route requires the authenticated order owner and a local or test-only flag. Provider callbacks remain planned.

After SQS persists the order, Express checks the authenticated owner before it shows mock outcome buttons.

MongoDB derives `stockTotal` from slot documents. It does not store `stockTotal` or `publicStock` on the listing document. The Valkey pool contains every slot. The number of completed orders cannot exceed the number of slot documents.

## Decisions & assumptions

- MongoDB stores Better Auth users, accounts, and credentials, plus business data.
- Better Auth email/password credentials use the MongoDB adapter.
- Better Auth sessions use Valkey secondary storage. Keep `session.storeSessionInDatabase` unset or `false`, so an absent session does not fall back to MongoDB.
- The authorizer does not call Express or MongoDB. It denies checkout when Valkey is unavailable or the session is missing.
- Valkey stores a user snapshot with each session. Checkout uses only `customerId`; privileged Express routes read current roles from MongoDB or invalidate sessions after role changes.
- A full Valkey loss removes active sessions. Customers must sign in again after recovery. Do not claim durable session storage.
- Express owns listing setup, authentication, reads, and durable persistence.
- Express enforces simple customer and administrator roles.
- Checkout accepts exactly one item and a client idempotency key.
- Valkey maps `(listingId, trusted customerId, client idempotencyKey)` to one `orderId` and `slotId`. The client creates the key, and the Lambda preserves it. MongoDB does not store it.
- API Gateway supplies the trusted customer identity to Lambda after the authorizer validates the Better Auth session. Lambda ignores browser-supplied `customerId` values.
- Valkey keeps the client idempotency key mapping. MongoDB does not store that key. If Valkey loses the binding, checkout fails closed.
- The backend will choose SQS dead-letter, visibility, batch, and polling settings in its implementation increment.

## Gotchas

The health endpoint has no business storage. Authentication, listing and slot models, order schema, and deterministic listing seed are implemented. Listing publication, Valkey seed and verification, workers, reconciler, migrations, and local service URLs are not implemented.

Do not make Express the hot-path inventory authority.

Do not acknowledge an SQS event before MongoDB persistence succeeds.

Delayed SQS events must not reopen a cancelled order.

Payment outcome handling remains planned.

Cancellation release remains planned.

Standard SQS can deliver duplicate or out-of-order events. The worker upserts orders by unique `orderId`.

The system has no durable replay if Lambda stops after the Valkey pop and before SQS accepts the event. Keep checkout closed when inventory ownership is unclear.

## Design links

- [System design](../../docs/system-design.md)
- [Orders](../../docs/orders.md)
- [Payments](../../docs/payments.md)
- [Identity and access](../../docs/identity-and-access.md)

## Change log

### 2026-09-22

- Added the planned backend boundary and responsibilities.
- Added payment callbacks, field ownership, and unified reconciliation responsibilities.
- Clarified payment-first stubs, terminal winners, and direct SQS worker consumption.
- Clarified atomic provider-event processing and callback retry after a crash.

### 2026-09-23

- Added mock-session ownership, role boundaries, and guarded retry after cancellation.
- Added immutable session `customerId` checks for browser owner access.
- Clarified event-driven reconciliation and the best-effort SQS publish retry.
- Added immutable payment outcomes, transactional release intents, the Express release worker, and callback route authentication.
- Moved Better Auth sessions to Valkey secondary storage and defined active-session refresh and expired-session cleanup behavior.
- Required Origin rejection before Better Auth or Valkey access.
- Made SQS the only Lambda-to-Express bridge and delayed payment-first terminal state until SQS correlation.
- Serialized callback reconciliation by per-order receive sequence and preserved mock outcomes after a quarantined callback.
- Added the physical slot count, derived public count, and all-slot Valkey seed responsibility.
- Added the Express bootstrap, OpenAPI health contract, endpoint handler, generated router, and request validation middleware.
- Added exact-origin CORS for the optional static storefront origin.
- Added dedicated session middleware tests and backend test-driven development guidance.
- Added Better Auth email/password sign-up and login with MongoDB accounts and Valkey sessions.
- Added Mongoose-backed listing, slot, and order models with a deterministic listing seed.
