# Payments

## Purpose

This document defines the mock payment page boundary.

## Flow

The SQS worker persists an order with `orderId`, `customerId`, `listingId`, `slotId`, and `PENDING` status. The `/payment?orderId=...` page polls the authenticated order read until persistence appears. Express returns an order only when the authenticated customer matches its stored `customerId`. It returns `404` for an absent or non-owned order.

After SQS accepts the reservation event, the checkout processor starts a payment session. The current payment feature validates the order UUID and returns a relative `/payment?orderId=<encoded id>` redirect. Lambda includes this redirect in the successful HTTP 202 response. A retry can create the same redirect from the same order ID. This mock session has no provider, persistence, or network call.

The page does not show outcome controls before SQS persistence and owner verification. A mock success changes `PENDING` to `COMPLETE`. A mock failure or expiry changes `PENDING` to `CANCELLED`. The owner-checked route accepts `success`, `failure`, or `expired` whenever the backend order routes are configured.

The backend payment feature applies mock outcomes. A repeated request with the same terminal status is safe. Both `failure` and `expired` set `CANCELLED`. A different terminal status returns `409`. Failure or expiry sets `releaseStatus: PENDING` in one atomic document update. The handler calls the order feature to release the slot through guarded Valkey and marks the intent complete only after Valkey confirms success. Provider callback correlation and payment reconciliation remain deferred.

If the process stops after MongoDB stores cancellation and no caller retries, no background sweep repairs the pending release. A payment caller must retry a failed or interrupted outcome request. The guarded Valkey release marker makes a retry safe if Valkey succeeded before MongoDB completion failed.

## Decisions & assumptions

- `orderId` is the only payment-page lookup identifier.
- The checkout processor creates a relative payment redirect after SQS accepts reservation facts.
- The browser can submit a mock outcome only for its own order after the backend confirms ownership.
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
- Added durable cancellation release intents and trigger-driven reconciliation. Provider callback correlation and payment reconciliation remain deferred.
