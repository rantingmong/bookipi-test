# Payment feature

The payment feature applies an outcome to a stored order. A MongoDB transaction changes `PENDING` to `COMPLETE` and changes its listing slot to `secured` with matching `orderId` and `customerId` values. A same-success retry repairs the slot link if needed. The slot update only changes an unowned `available` slot. It reports an absent or conflicting slot without changing another order's slot. A failed slot update rolls back the order update.

A failure or expiry changes `PENDING` to `CANCELLED` and sets `releaseStatus` to `PENDING` in the same document update. The request handler then reconciles the pending release before it returns a response.

A failed or interrupted outcome request must be retried by its caller. No background sweep repairs a pending release.

The first terminal status wins. A retry that has the same terminal status returns the stored order. Both `failure` and `expired` set `CANCELLED`, so either request can retry the same cancellation. A different terminal status raises `PaymentOutcomeConflictError`.

The feature does not call a payment provider or release inventory. The order feature reconciles pending cancelled slots. The mock outcome API keeps the existing `success`, `failure`, and `expired` request values.

## Change log

### 2026-09-24

- Added an atomic durable release intent to mock cancellation.
- Reconciled pending release after the payment outcome request.
- Secured the listing slot for a completed order and repaired the link on a same-success retry.
