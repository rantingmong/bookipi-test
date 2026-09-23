# storefront

## Purpose

The storefront will provide the React user interface for sale status, sign-in, purchase attempts, and purchase results.

## Flow

Next.js will read sale status from the backend.

The customer will sign in through Better Auth.

The storefront will send one purchase attempt with a client-generated idempotency key.

The storefront will show accepted, retryable, sold-out, and completed purchase states.

A future mock payment page will show success and failure buttons.

The mock page will call the owner-checked, local or test-only outcome route.

Express will translate the browser outcome into the provider-shaped callback handler. The browser will not call the service-authenticated callback route.

The page requires the authenticated order owner and a local or test-only feature flag.

The backend disables the mock outcome route outside local and test environments.

## Decisions & assumptions

- The storefront uses Next.js.
- The storefront does not reserve inventory directly.
- The storefront does not write MongoDB or Valkey.
- The storefront does not call the checkout Lambda directly.
- The mock payment page is a future test feature and is not implemented in this increment.
- API response details will follow the contract in `docs/system-design.md`.

## Gotchas

This package has metadata only.

It has no browser code, dependency, script, route, generated asset, or local URL.

Do not use React Router for this package.

Do not treat a client response as durable order proof until the backend reports the persisted result.

The payment page uses provider metadata for correlation only. The backend remains the authorization boundary.

The browser cannot self-assert payment success in a real deployment.

## Change log

### 2026-09-22

- Added the planned Next.js storefront boundary and responsibilities.
- Added the future mock payment page and callback boundary.
- Clarified server-side payment-session correlation for the future mock page.

### 2026-09-23

- Added owner and environment checks for the mock payment outcome page.
- Added immutable session-owner guidance.
- Clarified that Express translates browser outcomes and protects the service-authenticated callback route.
