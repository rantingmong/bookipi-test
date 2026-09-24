# Order worker

## Purpose

This feature consumes order reservation events from SQS and stores their facts through the order feature.

## Flow

`src/server.ts` starts the worker after MongoDB connects and the order indexes initialize. The worker validates each event, applies its facts, then acknowledges the message. Malformed and conflicting events remain unacknowledged. A MongoDB error stops polling, closes the API server, and fails the backend process.

## Decisions & assumptions

- The worker long-polls SQS directly. SQS does not trigger a Lambda.
- The queue deployment owns visibility, retry, and dead-letter settings.
- The worker does not read environment settings or connect to services during import.

## Tests

`feature.test.ts` checks malformed and conflicting message handling, acknowledgement, and polling stop behavior after a storage error.

## Change log

### 2026-09-24

- Added the SQS reservation worker feature.
