# Listing feature

The listing feature validates sale setup and creates one durable slot for each initial physical unit.

The listing document stores its identity, display name, sale window, and `reserveSlots`. The initial slot count is an operation parameter. The feature derives `stockTotal` by counting `listing-slots` documents. It derives `publicStock` as `stockTotal - reserveSlots`.

Listing and slot creation use one MongoDB transaction. The slot identifiers use the listing ID and a one-based slot position.

The feature can add slots to an existing listing in one transaction. It counts the current slot documents and inserts only the next sequential slot identifiers. It does not store a stock total. A listing timestamp write serializes concurrent additions. The unique `{ listingId, slotId }` index rejects collisions.

The feature does not publish Valkey state or expose an admin API.

## Change log

### 2026-09-23

- Added listing validation, transactional persistence, and durable slot models.
- Added transactional listing slot growth with stable sequential identifiers.
