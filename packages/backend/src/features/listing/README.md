# Listing feature

The listing feature validates sale setup and creates one durable slot for each initial physical unit.

The listing document stores its identity, display name, sale window, and `reserveSlots`. The initial slot count is an operation parameter. The feature derives `stockTotal` by counting `listing-slots` documents. It derives `publicStock` as `stockTotal - reserveSlots`.

Listing and slot creation use one MongoDB transaction. The slot identifiers use the listing ID and a one-based slot position.

After the transaction commits, the feature seeds all slot IDs in Valkey. It checks the count before it publishes the sale. A failed seed returns an error and leaves the sale unpublished.

The feature also provides a guarded cancellation release method. A future worker must confirm the MongoDB order is `CANCELLED` before it calls this method.

The feature can add slots to an existing listing in one transaction. It counts the current slot documents and inserts only the next sequential slot identifiers. It does not store a stock total. A listing timestamp write serializes concurrent additions. The unique `{ listingId, slotId }` index rejects collisions.

The feature does not expose an admin API. The demo seed lives in `src/features/seed` and calls `createListing`.

## Change log

### 2026-09-24

- Added Valkey seed, publication, and guarded cancellation release to the listing feature.
- Moved the deterministic demo seed to its own feature.

### 2026-09-23

- Added listing validation, transactional persistence, and durable slot models.
- Added transactional listing slot growth with stable sequential identifiers.
