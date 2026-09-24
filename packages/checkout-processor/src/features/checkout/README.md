# Checkout

## Purpose

This feature validates a checkout request, claims one inventory slot, and publishes its reservation facts.

## Flow

The feature gets trusted `customerId` from the handler. It asks inventory to claim one slot with a candidate UUID and the client idempotency key. It publishes `order-reserved.v1` after a successful claim. A retry publishes the same order and slot.

## Decisions & assumptions

- The request accepts `listingId` and `idempotencyKey`. It removes any browser `customerId` field.
- The event contains only `eventType`, `orderId`, `customerId`, `listingId`, and `slotId`.
- An SQS error leaves the Valkey claim in place. A same-key retry can publish it again.

## Change log

### 2026-09-24

- Added the checkout request, inventory claim, and event publication flow.
