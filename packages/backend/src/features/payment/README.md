# Payment feature

The payment feature applies a local or test payment outcome to a stored order. A success changes `PENDING` to `COMPLETE`. A failure or expiry changes `PENDING` to `CANCELLED`.

The first terminal outcome wins. A retry with the same outcome returns the stored order. A different terminal outcome raises `PaymentOutcomeConflictError`.

The feature does not call a payment provider or release inventory. The mock outcome API keeps the existing `success`, `failure`, and `expired` request values.
