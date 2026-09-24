# environment feature

## Purpose

This feature reads and validates backend environment settings during startup.

## Boundaries

- `feature.ts` has no service connections or other startup side effects.
- The server reads settings before it connects MongoDB or Valkey.
- Other features receive validated settings through their dependencies.

## Settings

The backend requires `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET`, `MONGODB_URI`, `MONGODB_DATABASE`, and `VALKEY_URL`.

Set `STOREFRONT_ORIGIN` when the storefront uses a different origin.

The demo seed command requires `MONGODB_URI`, `MONGODB_DATABASE`, and `VALKEY_URL`. It does not require Better Auth settings.

Backend startup also requires `AWS_REGION` and `SQS_QUEUE_URL`. The server starts the SQS worker after MongoDB connects and the order indexes initialize.

## Tests

`feature.test.ts` checks server and demo seed settings and exact-origin validation.

The worker settings test checks its MongoDB and SQS configuration.
