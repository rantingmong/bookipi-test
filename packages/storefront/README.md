# storefront

## Purpose

The storefront provides public sale status, direct checkout, Better Auth sign-up, login, and sign-out, a mock payment page, and an order status page.

## Runtime

Next.js exports a static site to `out/`. The home page reads `GET /api/listings/{listingId}` through the generated-client wrapper. Set `NEXT_PUBLIC_API_BASE_URL` and `NEXT_PUBLIC_LISTING_ID` at build time. It reads the current Better Auth session and calls `NEXT_PUBLIC_CHECKOUT_URL` directly for purchase. The checkout request includes credentials and contains only `listingId` and `idempotencyKey`. It uses one idempotency key for retries after request failure. It does not use a Next.js API route.

The `/sign-up` page registers the name, email, and password fields with React Hook Form. SWR triggers the Better Auth request. Better Auth applies its default password policy and signs in the user after success. The `/login` page registers the email and password fields with the same pattern. SWR triggers the login and sign-out requests. Both pages show the current session.

The auth pages keep feedback and session elements in the document. Tailwind CSS group data attributes control their visibility. Auth feedback reports the completed request. The session panel shows the current session. The Tailwind setup omits Preflight to preserve browser default styles. A session refresh error appears separately from auth feedback.

The home page reads the authenticated customer's order for the current listing. It shows the order ID and status, links a pending order to `/payment?orderId=...`, and links a completed order to `/order-status?orderId=...`. It disables purchase when an active or completed order is known. Home sign-out uses Better Auth, refreshes the session, and clears the customer-order response.

The home page shows `Units available` from `remainingUnits` and `Units bought` from `boughtUnits`. It hides total and reserved counts. The durable remaining count does not show the live Valkey pool.

The home page shows whether the sale is upcoming, open, or ended. It updates this state every second from the listing's sale window and disables checkout outside the open window. The checkout service remains the final authority.

The `/payment?orderId=...` page reads the order with the generated client wrapper and includes browser credentials. It polls while the SQS worker has not stored the order. It shows success and failure controls only after the API confirms the signed-in owner. It navigates to `/order-status?orderId=...` only after the outcome request succeeds. The `/order-status` page reads the order again and shows its current `PENDING`, `COMPLETE`, or `CANCELLED` status to the owner.

Run `pnpm generate:api` from the repository root to update the ignored browser client. Keep tracked feature wrappers under `src/lib/features`.

Run `pnpm --filter @bookipi/storefront test:e2e` for controlled Playwright tests. They check checkout requests, payment outcomes and status navigation, customer order state, home sign-out, and displayed listing counts. Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` to use an installed Chromium-based browser. The full local integration suite uses Caddy as one same-origin edge. Neither test proves deployed CloudFront or authorizer behavior.

Keep page UI in `src/app/<page>/page.tsx` and its state hook in `page.state.tsx`. Put page-specific components in `parts`, shared hooks in `src/hooks`, generated client code in `src/lib/api/generated`, tracked client wrappers and shared feature state in `src/lib/features`, and shared UI components in `src/ui`. Create these directories when their first file is needed.

## Flow

Next.js will read sale status and purchase results from the Express backend.

The customer can sign up and sign in through the Better Auth client. Auth requests use `NEXT_PUBLIC_API_BASE_URL` and include browser credentials.

The browser sends one purchase attempt with a client-generated idempotency key to the configured checkout URL. The local URL is `http://bookipi.localhost:3200/api/checkout`. Caddy serves auth, API reads, and checkout under the same host.

The client sends the key only. The checkout service scopes it to the listing and authorizer-derived customer identity. The browser also sends its `Origin` header for the authorizer's trusted-origin check.

In deployment, CloudFront routes the request through API Gateway to the checkout Lambda. In local tests, Caddy routes it to LocalStack API Gateway. Express does not proxy the purchase request.

The storefront shows accepted, retryable, unauthenticated, sold-out, and completed purchase states. It shows sign-in guidance for an explicit unauthenticated response. After an opaque checkout failure or a readable `403` without a checkout error code, it revalidates the Better Auth session. An absent session shows sign-in guidance. An active session keeps the request retryable. Explicit checkout errors do not trigger session revalidation. A retry reuses the same idempotency key.

The listing keeps `publicStock` as the slot-document count minus `reserveSlots`. `remainingUnits` subtracts durable pending and complete orders from that count. Checkout reports sold out only when Valkey has no claimable slot.

The `/payment?orderId=...` page shows a pending state until the Express SQS worker stores the MongoDB order. It uses `orderId` and shows success and failure buttons only after Express checks the authenticated owner. A successful outcome request opens `/order-status?orderId=...`, which reads the order by its ID.

The home page uses the authenticated current-order route to show an order ID and status for the selected listing. The route returns only pending or complete orders. A pending order links to the mock payment page. A completed order links to the order status page.

The mock page calls the owner-checked outcome route after the order exists.

The page acts on `orderId`. Provider callback handling remains planned.

The page requires the authenticated order owner. The payment outcome route is available whenever the backend order routes are configured.

## Decisions & assumptions

- The storefront uses Next.js.
- The storefront does not reserve inventory directly.
- The home page clears its customer-order response after sign-out and refreshes the Better Auth session.
- The listing's displayed total comes from slot documents. The storefront does not treat that count as the sold-out authority.
- The storefront does not write MongoDB or Valkey.
- The browser does not send its purchase request to Express.
- The API Gateway REST REQUEST Lambda authorizer checks the Better Auth session in Valkey and supplies trusted `customerId`. The browser cannot set the trusted identity.
- The mock payment page does not send provider callbacks or release cancelled slots.
- Checkout details will follow `docs/checkout.md`. Result details will follow `docs/orders.md`.

## Gotchas

The storefront shows listing status and purchase feedback on the home page. Checkout errors decide whether the pool is sold out. The displayed `publicStock` value does not prove live remaining stock.

Each home, payment, login, and sign-up page keeps its content in `src/app/<page>/parts/content`. The content component owns the page `<main>` and provides page state through context. Leaf parts read that context instead of receiving page-state props.

Do not use React Router for this package.

Do not treat a client response as durable order proof until the backend reports the persisted result.

The browser cannot self-assert payment success in a real deployment.

The displayed `remainingUnits` and `boughtUnits` come from MongoDB order documents. They do not prove the current number of slots in Valkey.

For cross-origin deployments, API Gateway must return the exact allowed `Origin` and `Access-Control-Allow-Credentials: true` in a `GatewayResponse` for authorizer denials. Local tests use one origin. They do not prove deployed CloudFront or API Gateway behavior.

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
- Added dedicated sign-up and login pages with session display and sign-out.

### 2026-09-24

- Added the static mock payment page and credentialed order client wrapper. Browser checks remain pending.
- Moved payment order state under `src/lib/features` and page content under `src/app/payment/parts`.
- Added the public listing client, direct credentialed checkout request, retry key reuse, and home-page purchase states.
- Added a controlled Playwright checkout retry test. It does not test deployed CloudFront or authorizer behavior.

### 2026-09-25

- Added current-listing order state, home sign-out, available and bought unit display, and the shared order status page.
- Added live sale-window status and disabled checkout before the sale starts and after it ends.
