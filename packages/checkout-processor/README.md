# checkout-processor

## Purpose

The checkout processor will run as an AWS Lambda function for the purchase hot path.

## Flow

The backend will pass a trusted customer identity, listing identifier, and idempotency key.

The Lambda will generate the authoritative `orderId`.

The Lambda will atomically check the sale window, idempotency, and one-item-per-user rule in Valkey, then pop one available slot.

The same Valkey operation will create the reservation and idempotency binding.

The Lambda will publish an order-reserved event to a Standard SQS queue.

The Lambda will call the internal Express mock-payment endpoint with trusted `customerId`, `orderId`, `reservationId`, `listingId`, and `slotId` data.

The endpoint will create or reuse the MongoDB session binding by `orderId`.

The Lambda will return a stable attempt result for safe retries.

## Decisions & assumptions

- Lambda owns hot-path Valkey reservation and SQS publication.
- The initial quantity is exactly one.
- The Lambda will not trust a customer identity from the browser.
- SQS is transport and is not the durable order store.
- A retry uses the same idempotency key and reuses the reservation while Valkey retains its state.
- A repeated logical attempt returns the same `orderId`; downstream retries are best effort.
- A new idempotency key cannot bypass a completed purchase, but it can start a new checkout after cancellation.
- The server stores the session binding and validates callback data against it.
- The implementation increment will choose Lambda timeout and SQS delivery settings.

## Gotchas

This package has metadata only.

It has no handler, dependency, script, deployment file, or local URL.

The Express SQS worker consumes the LocalStack queue. This design has no SQS-to-Lambda event source mapping.

If SQS publication fails after reservation, the Lambda returns a retryable service error. A later request with the same key can retry publication while Valkey retains the reservation.

This retry is best effort. There is no durable replay if Lambda stops after the Valkey pop and before SQS accepts the event, or if Valkey loses the reservation state.

Standard SQS can deliver duplicate or out-of-order events. The backend worker handles them idempotently.

Payment failure or expiration cancels the order and releases its slot through one guarded operation.

The release compares the old `reservationId` before it removes the customer claim or returns the slot.

## Change log

### 2026-09-22

- Added the planned Lambda boundary and reservation responsibilities.
- Added authoritative order creation and mocked payment-session sequencing.
- Clarified immutable session binding and retry behavior after SQS publication.

### 2026-09-23

- Added compare-and-delete release rules for new checkout after cancellation.
- Added trusted `customerId` to internal mock-session creation.
- Clarified best-effort retries and the Valkey pop-to-SQS crash gap.
