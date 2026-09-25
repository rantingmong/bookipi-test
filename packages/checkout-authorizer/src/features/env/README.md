# Environment feature

## Purpose

This feature validates the auth URL, secret, exact storefront origin, and Valkey URL.

## Boundaries

- Importing the feature does not read process settings or connect to services.
- The runtime calls `parseEnvironment` only after the request Origin and cookie pass.

## Change log

### 2026-09-24

- Added authorizer environment validation.
