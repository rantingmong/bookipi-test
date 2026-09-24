# inventory

## Purpose

This feature atomically claims one published slot from Valkey.

## Flow

The processor checks the idempotency binding, publication, sale time, and active customer order in one Valkey script. It then pops one slot and records the `orderId`, `customerId`, and `listingId` in the listing-scoped `orders` hash. The same `(listingId, customerId, idempotencyKey)` returns its original order and slot. The backend listing feature owns guarded release.

## Decisions & assumptions

- The pool contains every physical listing slot.
- Valkey runs the claim as a Lua script. Its keys use the listing ID hash tag.
- The claim script passes all five Redis keys through `KEYS`. It stores tuple and order data in hash fields.
- A listing and customer can have only one active order. Guarded cancellation release removes that customer's field from `active-customers`.
- Idempotency records remain after cancellation. A retry with a cancelled key does not claim another slot.
- The order transition and its durable release intent belong to the backend and remain outside this feature.

## Gotchas

The feature returns distinct outcomes for unpublished listings, closed sales, sold-out inventory, active orders, and cancelled attempts. Valkey errors fail the checkout request.

## Change log

### 2026-09-24

- Added the atomic slot claim operation.

### 2026-09-24

- Scoped claims by listing, trusted customer, and client idempotency key.
- Added one-active-order checks and stable same-key reservation retries.
- Stored all claim data in listing-scoped hashes and passed Redis keys explicitly to Lua.
