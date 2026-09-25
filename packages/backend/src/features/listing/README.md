# Listing feature

The listing feature validates sale setup and creates one durable slot for each initial physical unit.

The listing document stores its identity, display name, sale window, and `reserveSlots`. The initial slot count is an operation parameter. The feature derives `stockTotal` by counting `listing-slots` documents. It derives `publicStock` as `stockTotal - reserveSlots`.

Listing IDs contain 1 to 128 ASCII letters, digits, underscores, or hyphens. The first character is a letter or digit. This rule keeps the ID inside its Valkey hash tag and matches checkout validation.

Listing and slot creation use one MongoDB transaction. The slot identifiers use the listing ID and a one-based slot position.

After the transaction commits, the feature seeds all slot IDs in Valkey. It checks the count before it publishes the sale. A failed seed returns an error and leaves the sale unpublished.

The feature also provides a guarded cancellation release method. It checks the order in the listing-scoped `orders` hash, the customer in `active-customers`, the listing, the slot, the cancellation status, and the release marker in one Valkey script. It returns the slot to the shared pool and removes the matching active-customer hash field. A matching existing marker returns success, so a worker can retry after a crash between Valkey and MongoDB writes. A mismatched marker or owner returns failure.

The feature can add slots to an existing listing in one transaction. It counts the current slot documents and inserts only the next sequential slot identifiers. It does not store a stock total. A listing timestamp write serializes concurrent additions. The unique `{ listingId, slotId }` index rejects collisions.

The public listing-status read returns durable listing metadata and counts derived from slot documents. It returns `listingId`, `productName`, `saleStartsAt`, `saleEndsAt`, `stockTotal`, `reserveSlots`, and `publicStock`. It derives `stockTotal` from the slot documents and derives `publicStock` as `stockTotal - reserveSlots`. The API returns `404` when the listing does not exist. `publicStock` is an advertised durable count. Valkey inventory decides whether checkout is sold out.

The feature does not expose an admin API. The demo seed lives in `src/features/seed` and calls `createListing`.

## Change log

### 2026-09-24

- Added the public listing-status read with durable metadata and derived slot counts.
- Added Valkey seed, publication, and guarded cancellation release to the listing feature.
- Made a matching cancellation release marker an idempotent success.
- Updated guarded release to clear the matching active-customer order key.
- Moved the deterministic demo seed to its own feature.
- Restricted listing IDs to safe Valkey hash-tag values.

### 2026-09-23

- Added listing validation, transactional persistence, and durable slot models.
- Added transactional listing slot growth with stable sequential identifiers.
