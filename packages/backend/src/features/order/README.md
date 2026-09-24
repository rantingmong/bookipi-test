# Order feature

The order feature stores `orderId`, `customerId`, `listingId`, `slotId`, `status`, and timestamps. `orderId` identifies the checkout attempt and slot owner.

The order statuses are `PENDING`, `COMPLETE`, and `CANCELLED`. Unique partial indexes protect active customer/listing and listing/slot ownership. The feature applies immutable reservation facts with an upsert by `orderId`.

The feature rejects an event when its customer, listing, or slot differs from the stored order. The SQS worker leaves that message unacknowledged.

## Change log

### 2026-09-23

- Added the minimal durable order schema and active ownership indexes.

### 2026-09-24

- Added idempotent persistence for immutable SQS reservation facts.
