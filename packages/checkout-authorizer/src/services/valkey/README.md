# Valkey service

## Purpose

This service creates the lazy Redis client and Better Auth secondary storage for checkout sessions.

## Boundaries

- The service uses the same `bookipi:auth:` prefix as the Express backend.
- The client uses lazy connection. Importing the service does not connect to Valkey.
- The authorizer does not use MongoDB as a session fallback.

## Change log

### 2026-09-24

- Added the Valkey-backed Better Auth secondary-storage service.
