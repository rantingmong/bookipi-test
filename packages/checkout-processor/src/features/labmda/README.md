# Lambda HTTP helpers

## Purpose

This feature parses API Gateway request bodies and formats checkout responses.

## Flow

The handler reads JSON from a plain or base64 request body. It maps checkout results to HTTP status codes and JSON bodies.

## Decisions

- The feature does not read environment settings or create service clients.
- Checkout conflicts return HTTP 409. Retryable failures return HTTP 503.
