# Payments

## Purpose

This document defines the mock payment page boundary.

## Flow

The SQS worker persists an order with `orderId`, `customerId`, `listingId`, `slotId`, and `PENDING` status. The `/payment?orderId=...` page polls the authenticated order read until persistence appears. Express returns an order only when the authenticated customer matches its stored `customerId`. It returns `404` for an absent or non-owned order.

After SQS accepts the reservation event, the checkout processor starts a payment session. The current payment feature validates the order UUID and returns a relative `/payment?orderId=<encoded id>` redirect. Lambda includes this redirect in the successful HTTP 202 response. A retry can create the same redirect from the same order ID. This mock session has no provider, persistence, or network call.

The page does not show outcome controls before SQS persistence and owner verification. The build must also set `NEXT_PUBLIC_MOCK_PAYMENT_ENABLED=true` to show the controls. A mock success changes `PENDING` to `COMPLETE`. A mock failure or expiry changes `PENDING` to `CANCELLED`. The owner-checked route accepts `success`, `failure`, or `expired` only when `MOCK_PAYMENT_ENABLED=true` and `NODE_ENV` is `development` or `test`. The disabled route returns `404`.

The backend payment feature applies mock outcomes. A repeated same-result request is safe. A conflicting terminal result returns `409`. Mock cancellation does not release inventory. Provider callbacks, payment reconciliation, and slot release after cancellation remain outside this increment.

## Decisions & assumptions

- `orderId` is the only payment-page lookup identifier.
- The checkout processor creates a relative payment redirect after SQS accepts reservation facts.
- The browser can submit a mock outcome only for its own order in local or test mode.
- The page shows success and failure controls only. Tests and internal callers can submit expiry.
- The order record gains no payment-provider fields.
- A provider callback route requires service authentication when it is implemented.
- SQS is the only Lambda-to-Express bridge for the order fields.

## Gotchas

The order page must wait for the SQS worker to persist the order. A checkout response alone does not provide durable order state.

## Change log

### 2026-09-23

- Simplified the mock payment page to use the persisted `orderId`.
- Deferred provider callbacks, payment reconciliation, and cancellation release work.

### 2026-09-24

- Added the static mock page, owner-checked order APIs, and local or test outcome transitions. Browser and service integration checks remain pending.
- Added the checkout payment-session feature and returned its redirect URL after SQS acceptance.
