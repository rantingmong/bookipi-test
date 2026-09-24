# Valkey service

## Purpose

This service creates the Valkey client for the checkout processor.

## Flow

The Lambda runtime creates this client after it validates runtime settings. The first Valkey command opens the connection.

## Decisions & assumptions

- Importing this service does not open a connection.
- The runtime reuses one client across warm Lambda invocations.

## Change log

### 2026-09-24

- Added lazy Valkey client creation.
