# SQS service

## Purpose

This service sends validated order reservation events to the configured SQS queue.

## Flow

The checkout feature supplies `order-reserved.v1`. This service validates the event and sends it as one SQS message.

## Decisions & assumptions

- SQS is the only Lambda-to-Express bridge.
- The event contains reservation facts only. The service does not add payment data.

## Change log

### 2026-09-24

- Added AWS SDK SQS message publication.
