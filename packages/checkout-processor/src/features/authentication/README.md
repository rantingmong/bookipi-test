# Checkout authentication

## Purpose

This feature validates the Better Auth session for the local Hobby adapter.

## Flow

The local handler checks the configured exact Origin first. It passes the API Gateway event and runtime session reader to `authenticateCheckoutSession`. This feature reads the cookie and request headers, rejects a missing or invalid session, and returns only the active session user's ID. It does not read environment settings or create clients.

The runtime creates Better Auth with Valkey secondary storage. It disables session refresh and cookie-cache use during checkout authorization. The production API Gateway REQUEST authorizer remains in `packages/checkout-authorizer`.

## Decisions & assumptions

- Better Auth session errors propagate to the handler. The handler returns a safe retryable response.
- A missing session returns no customer ID. The handler returns `401 UNAUTHENTICATED`.
- This local Hobby adapter is not the production architecture and does not prove AWS authorizer behavior.

## Tests

`feature.test.ts` checks missing cookies, invalid and valid sessions, and storage errors.
