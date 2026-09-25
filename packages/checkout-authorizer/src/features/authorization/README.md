# Authorization feature

## Purpose

This feature checks the exact storefront Origin and validates the Better Auth session before checkout.

## Boundaries

- It rejects a missing or unapproved Origin before it reads a session.
- It rejects a missing cookie before it reads a session.
- It uses Better Auth `getSession` with refresh and cookie cache disabled.
- It returns only the verified customer ID.
- It denies on a missing session or session-store error.

## Change log

### 2026-09-24

- Added origin-first checkout session authorization.
