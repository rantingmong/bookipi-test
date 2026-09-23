# storefront

## Purpose

The storefront will provide the React user interface for sale status, sign-in, purchase attempts, and purchase results.

## Flow

Next.js will read sale status and purchase results from the Express backend.

The customer will sign in through Better Auth.

The browser will send one purchase attempt with a client-generated idempotency key directly to the configured CloudFront checkout endpoint.

The client sends the key only. The checkout service scopes it to the listing and authorizer-derived customer identity. The browser also sends its `Origin` header for the authorizer's trusted-origin check.

CloudFront will route the request through API Gateway to the checkout Lambda. Express will not proxy the purchase request.

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
- The browser does not send its purchase request to Express.
- The API Gateway Lambda authorizer checks the Better Auth session and supplies trusted `customerId`. The browser cannot set the trusted identity.
- The mock payment page is a future test feature and is not implemented in this increment.
- Checkout details will follow `docs/checkout.md`. Result details will follow `docs/orders.md`.

## Gotchas

This package has metadata only.

It has no browser code, dependency, script, route, generated asset, or local URL.

Do not use React Router for this package.

Do not treat a client response as durable order proof until the backend reports the persisted result.

The payment page uses provider metadata for correlation only. The backend remains the authorization boundary.

The browser cannot self-assert payment success in a real deployment.

## Design links

- [System design](../../docs/system-design.md)
- [Checkout](../../docs/checkout.md)
- [Identity and access](../../docs/identity-and-access.md)

## Change log

### 2026-09-22

- Added the planned Next.js storefront boundary and responsibilities.
- Added the future mock payment page and callback boundary.
- Clarified server-side payment-session correlation for the future mock page.

### 2026-09-23

- Added owner and environment checks for the mock payment outcome page.
- Added immutable session-owner guidance.
- Clarified that Express translates browser outcomes and protects the service-authenticated callback route.
