# checkout-authorizer

## Purpose

This package will authorize checkout requests at the API Gateway REST API boundary.

## Decisions

- The authorizer is a separate package. It does not run in Express or the checkout processor.
- It checks the request origin before it reads a Better Auth session from Valkey.
- It returns only the verified customer identity to API Gateway.
- It does not call Express or MongoDB.

## Scope

Increment 1 records the package boundary. A later increment will implement the authorizer after Better Auth and Valkey session storage exist.

## Change log

### 2026-09-23

- Added the dedicated checkout authorizer package.
