# auth feature

## Purpose

This feature owns customer sign-up, sign-in, sign-out, and session lookup through Better Auth.

## Flow

The Express app sends `/api/auth/*` requests to Better Auth before it parses JSON bodies.

Better Auth stores users and email/password credentials in MongoDB.

Better Auth stores sessions in Valkey secondary storage with the `bookipi:auth:` prefix.

## Decisions and limits

- Email/password uses Better Auth defaults. The feature adds no custom password policy.
- A successful sign-up uses Better Auth default auto sign-in behavior.
- `session.storeSessionInDatabase` is `false`. A missing Valkey session has no MongoDB fallback.
- `STOREFRONT_ORIGIN` adds one exact trusted origin when it is set.
- This feature does not add email verification, password reset, social sign-in, roles, or listing behavior.
- The environment feature validates startup settings. MongoDB and Valkey connections start in `src/server.ts`.

## Settings

The backend requires `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET`, `MONGODB_URI`, `MONGODB_DATABASE`, and `VALKEY_URL` at startup.

Set `STOREFRONT_ORIGIN` when the storefront uses a different origin.

## Tests

`feature.test.ts` checks storage selection, session identity mapping, and Valkey failure propagation.

`../env/feature.test.ts` checks environment settings.

`src/app.test.ts` checks that Better Auth receives the raw request before Express JSON parsing.

These tests use local seams. They do not prove MongoDB or Valkey integration.
