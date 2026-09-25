# checkout-authorizer

## Purpose

This package authorizes checkout requests at the API Gateway REST API boundary.

## Runtime

`src/handler.ts` exports the API Gateway REST REQUEST authorizer handler. It checks the exact `Origin` value before it parses runtime settings, creates a Valkey client, or reads a session. A missing or unapproved origin returns a Deny policy. A missing cookie also returns Deny without a Valkey connection.

After those checks, the handler creates a lazy Better Auth runtime. It uses the existing `bookipi:auth:` Valkey secondary-storage prefix. Better Auth `getSession` validates the opaque cookie, signature, and expiry. The call sets `disableRefresh: true` and `disableCookieCache: true`. It returns only the verified `customerId` in the API Gateway authorizer context.

The package has no MongoDB or Express dependency. A missing session, bad environment, or Valkey error returns Deny. Do not configure API Gateway authorizer-result caching.

## Settings

Set `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET`, `STOREFRONT_ORIGIN`, and `VALKEY_URL`. `STOREFRONT_ORIGIN` must be one exact HTTP or HTTPS origin without a path. Match the value used by backend Better Auth and checkout CORS.

## Tests

`pnpm test` checks origin rejection before runtime access, cookie checks, session settings, allow and deny policies, environment validation, and failure behavior. `pnpm typecheck` and `pnpm build` check the Lambda package.

These tests do not prove API Gateway or CloudFront configuration. Deployment must disable authorizer-result caching and forward the cookie and Origin header. Configure an unauthenticated API Gateway `OPTIONS` method for cross-origin requests. It must not invoke this authorizer or checkout Lambda.

For a cross-origin deployment, configure an API Gateway `GatewayResponse` for authorizer denials. It must return the exact allowed `Origin` and `Access-Control-Allow-Credentials: true`. Without these headers, the browser can report a Deny response as an opaque network error. This repository contains no deployment configuration or proof for this behavior.

## Change log

### 2026-09-24

- Implemented the REST REQUEST authorizer with lazy Valkey session access and exact-origin checks.
- Added Better Auth session validation and focused package tests.
