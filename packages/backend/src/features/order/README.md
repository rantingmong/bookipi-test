# Order feature

The order feature stores `orderId`, `customerId`, `listingId`, `slotId`, `status`, and timestamps. `orderId` identifies the checkout attempt and slot owner.

The order statuses are `PENDING`, `COMPLETE`, and `CANCELLED`. Unique partial indexes protect active customer/listing and listing/slot ownership. The feature applies immutable reservation facts with an upsert by `orderId`.

The feature rejects an event when its customer, listing, or slot differs from the stored order. The SQS worker leaves that message unacknowledged.

The feature can find the current customer's order for one listing. It returns only `PENDING` or `COMPLETE` orders. The authenticated `GET /api/orders/current?listingId=...` route uses this lookup and returns `404` when no active or completed order exists.

Cancelled orders can store `releaseStatus: PENDING` or `releaseStatus: COMPLETE`. Orders that do not need a slot release omit this field. The order feature reconciles a pending release after an SQS reservation upsert or payment outcome. It calls the guarded Valkey release with durable order facts, then marks the release complete only after Valkey confirms success. A guarded rejection throws so the caller can retry.

No background sweep repairs a pending release. A process stop after MongoDB stores cancellation can leave the intent pending if no caller retries. SQS retries when release reconciliation fails before acknowledgement. A payment caller must retry a failed or interrupted outcome request.

## Change log

### 2026-09-25

- Added authenticated lookup by listing for the current customer.

### 2026-09-23

- Added the minimal durable order schema and active ownership indexes.

### 2026-09-24

- Added idempotent persistence for immutable SQS reservation facts.
- Added the durable slot-release state to the order model.
- Added trigger-driven per-order slot-release reconciliation.
