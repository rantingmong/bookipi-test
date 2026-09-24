# Order feature

The order feature stores `orderId`, `customerId`, `listingId`, `slotId`, `status`, and timestamps. `orderId` identifies the checkout attempt and slot owner.

The order statuses are `PENDING`, `COMPLETE`, and `CANCELLED`. Unique partial indexes protect active customer/listing and listing/slot ownership. This feature defines the order model and indexes. It does not implement order transitions or reconciliation.

## Change log

### 2026-09-23

- Added the minimal durable order schema and active ownership indexes.
