# Customer identity

## Purpose

This feature reads the trusted customer ID from the API Gateway authorizer.

## Flow

The handler uses this ID for checkout. The feature rejects a missing or invalid authorizer value.

## Decisions

- The request body does not set customer identity.
- A customer ID must be a non-empty string after trimming whitespace.
