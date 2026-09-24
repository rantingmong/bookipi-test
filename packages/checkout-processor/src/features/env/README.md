# Environment

## Purpose

This feature validates the settings that the checkout processor needs at runtime.

## Flow

The Lambda runtime reads `VALKEY_URL` and `ORDER_EVENTS_QUEUE_URL` on its first request. It passes the validated values to the Valkey and SQS services.

## Decisions & assumptions

- Importing this feature does not read process environment settings.
- A missing or invalid setting fails the request before the runtime creates clients.

## Change log

### 2026-09-24

- Added runtime validation for the Valkey URL and SQS queue URL.
