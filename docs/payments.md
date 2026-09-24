# Payments

## Purpose

This document defines the mock payment page boundary.

## Flow

The SQS worker persists an order with `orderId`, `customerId`, `listingId`, `slotId`, and `PENDING` status. The mock payment page uses `orderId` to read the durable order. Express checks the authenticated customer against the stored `customerId` before it shows outcome controls.

The page does not show outcome controls before SQS persistence. A mock success changes the order status to `COMPLETE`. A mock failure or expiry changes it to `CANCELLED`. These transitions and the owner-checked route remain planned work.

The payment processor is mocked. Provider callbacks, payment reconciliation, and slot release after cancellation remain outside this model increment.

## Decisions & assumptions

- `orderId` is the only payment-page lookup identifier.
- The browser can submit a mock outcome only for its own order in local or test mode.
- A provider callback route requires service authentication when it is implemented.
- SQS is the only Lambda-to-Express bridge for the order fields.

## Gotchas

The order page must wait for the SQS worker to persist the order. A checkout response alone does not provide durable order state.

## Change log

### 2026-09-23

- Simplified the mock payment page to use the persisted `orderId`.
- Deferred provider callbacks, payment reconciliation, and cancellation release work.
