# storefront

## Purpose

The storefront will provide the React user interface for sale status, sign-in, purchase attempts, and purchase results.

## Runtime

Next.js exports a static site to `out/`. The home page checks `GET /api/system/health` from the browser when `NEXT_PUBLIC_API_BASE_URL` is set to the API origin at build time. It uses SWR's deferred mutation hook for the button request. It does not use a Next.js API route.

Run `pnpm generate:api` from the repository root to update the ignored browser client. Keep tracked feature wrappers under `src/lib/features`.

Keep page UI in `src/app/<page>/page.tsx` and its state hook in `page.state.tsx`. Put page-specific components in `parts`, shared hooks in `src/hooks`, generated client code in `src/lib/api/generated`, tracked client wrappers in `src/lib/features`, and shared UI components in `src/ui`. Create these directories when their first file is needed.

## Flow

Next.js will read sale status and purchase results from the Express backend.

The customer will sign in through Better Auth.

The browser will send one purchase attempt with a client-generated idempotency key directly to the configured CloudFront checkout endpoint. Serve auth and checkout under the same host, or keep the checkout hostname within the Better Auth cookie scope. If the storefront and checkout origins differ, the request will use `credentials: 'include'`.

The client sends the key only. The checkout service scopes it to the listing and authorizer-derived customer identity. The browser also sends its `Origin` header for the authorizer's trusted-origin check.

CloudFront will route the request through API Gateway to the checkout Lambda. Express will not proxy the purchase request.

The storefront will show accepted, retryable, sold-out, and completed purchase states.

The listing advertises `publicStock = stockTotal - reserveSlots`. Checkout reports sold out only when Valkey has no claimable slot. The wording for the live count when public remaining reaches zero before the Valkey pool is empty remains open.

A future mock payment page will show a pending state until the Express SQS worker stores the MongoDB session binding. It will show success and failure buttons only after Express checks the authenticated owner against that binding.

The mock page will call the owner-checked, local or test-only outcome route after the binding exists.

Express will translate the browser outcome into the provider-shaped callback handler. The browser will not call the service-authenticated callback route.

The page requires the authenticated order owner and a local or test-only feature flag.

The backend disables the mock outcome route outside local and test environments.

## Decisions & assumptions

- The storefront uses Next.js.
- The storefront does not reserve inventory directly.
- `publicStock` is the advertised listing count. The storefront does not treat it as the true physical slot count or the sold-out authority.
- The storefront does not write MongoDB or Valkey.
- The browser does not send its purchase request to Express.
- The API Gateway REST REQUEST Lambda authorizer checks the Better Auth session in Valkey and supplies trusted `customerId`. The browser cannot set the trusted identity.
- The mock payment page is a future test feature and is not implemented in this increment.
- Checkout details will follow `docs/checkout.md`. Result details will follow `docs/orders.md`.

## Gotchas

The storefront shell has no sign-in, listing, purchase, or result screen yet. No local API URL is defined.

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
- Updated checkout identity to the Valkey-backed REST REQUEST authorizer.
- Added the Better Auth cookie-scope precondition and cross-origin request credentials rule.
- Made the mock payment page wait for the SQS-backed binding before it shows outcome buttons.
- Recorded the advertised count and the open live-count wording choice.
- Added the static-export Next.js app shell and browser API health check.
- Added SWR for the deferred health request and kept the generated client behind the tracked feature wrapper.
