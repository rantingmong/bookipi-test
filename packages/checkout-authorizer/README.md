# checkout-authorizer

## Purpose

This package authorizes checkout requests at the API Gateway REST API boundary.

## Runtime

`src/handler.ts` exports the API Gateway REST REQUEST authorizer handler. It checks the exact `Origin` value before it parses runtime settings, creates a Valkey client, or reads a session. A missing or unapproved origin returns a Deny policy. A missing cookie also returns Deny without a Valkey connection.

After those checks, the handler creates a lazy Better Auth runtime. It uses the existing `bookipi:auth:` Valkey secondary-storage prefix. Better Auth `getSession` validates the opaque cookie, signature, and expiry. The call sets `disableRefresh: true` and `disableCookieCache: true`. It returns only the verified `customerId` in the API Gateway authorizer context.

The package has no MongoDB or Express dependency. A missing session, bad environment, or Valkey error returns Deny. Do not configure API Gateway authorizer-result caching.

The isolated prototype at `infra/localstack/prototypes/rest-request-authorizer/` shows that LocalStack `2026.8.4` Hobby did not invoke or enforce a configured REST REQUEST authorizer. The local API uses a combined authentication adapter in `packages/checkout-processor`. Keep `src/handler.ts` as the production entry point. The local workaround does not prove production API Gateway or AWS authorizer behavior.

## Settings

Set `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET`, `STOREFRONT_ORIGIN`, and `VALKEY_URL`. `STOREFRONT_ORIGIN` must be one exact HTTP or HTTPS origin without a path. Match the value used by backend Better Auth and checkout CORS.

## Tests

`pnpm test` checks the production REQUEST handler, origin-first rejection, session checks, environment validation, and safe denial behavior. `pnpm typecheck` and `pnpm build` check the Lambda package.

These tests do not prove deployed API Gateway or CloudFront configuration. LocalStack `2026.8.4` Hobby did not invoke or enforce a configured REQUEST authorizer in the isolated prototype. The local integration stack uses `AuthorizationType: NONE` and checks the cookie and Origin in a local-only adapter in the checkout processor. It does not test REQUEST-authorizer invocation or result caching. Deployment must disable authorizer-result caching and forward the cookie and Origin header. Configure an unauthenticated API Gateway `OPTIONS` method for cross-origin requests. It must not invoke the production authorizer or checkout Lambda.

For a cross-origin deployment, configure an API Gateway `GatewayResponse` for authorizer denials. It must return the exact allowed `Origin` and `Access-Control-Allow-Credentials: true`. Without these headers, the browser can report a Deny response as an opaque network error. This repository contains no deployment configuration or proof for this behavior.

The local stack creates a per-run Better Auth secret and passes it to the backend and checkout processor. CloudFormation marks the parameter `NoEcho`. LocalStack runtime configuration can still expose function environment values to local users. Production secret retrieval is outside this local-test setup.

## Change log

### 2026-09-24

- Implemented the REST REQUEST authorizer with lazy Valkey session access and exact-origin checks.
- Added Better Auth session validation and focused package tests.
