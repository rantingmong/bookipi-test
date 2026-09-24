# Checkout

## Purpose

This feature validates a checkout request, claims one inventory slot, and publishes its reservation facts.

## Flow

The feature gets trusted `customerId` from the handler. It asks inventory to claim one slot with a candidate UUID and the client idempotency key. It publishes `order-reserved.v1` after a successful claim. After SQS accepts the event, it creates a payment session and returns its redirect URL with the order ID and `PENDING` status. A retry publishes the same order and slot, then creates the same relative redirect.

## Decisions & assumptions

- The request accepts `listingId` and `idempotencyKey`. It removes any browser `customerId` field.
- The event contains only `eventType`, `orderId`, `customerId`, `listingId`, and `slotId`.
- The successful result includes `redirectUrl`. The payment session does not use a provider, network request, or persistent store.
- An SQS error leaves the Valkey claim in place. A same-key retry can publish it again.

## Change log

### 2026-09-24

- Added the checkout request, inventory claim, and event publication flow.
