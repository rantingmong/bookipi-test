# Environment

## Purpose

This feature validates the settings that the checkout processor needs at runtime.

## Flow

The production Lambda runtime reads `VALKEY_URL` and `ORDER_EVENTS_QUEUE_URL` on its first request. The local Hobby adapter also reads `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET`, and exact `STOREFRONT_ORIGIN` when it first checks a session. It passes validated values to the Valkey, SQS, and Better Auth services.

## Decisions & assumptions

- Importing this feature does not read process environment settings.
- A missing or invalid setting fails the request before the runtime creates clients.
- The local auth settings are required only by `parseLocalAdapterEnvironment`.

## Change log

### 2026-09-24

- Added runtime validation for the Valkey URL and SQS queue URL.
