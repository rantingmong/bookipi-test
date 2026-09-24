# HTTP service

## Purpose

This service starts the Express HTTP server and waits for its socket to bind.

## Flow

The server startup feature waits for the `listening` event before it starts the SQS worker. A bind error rejects startup and removes the other event listener.

## Tests

`server.test.ts` checks listening and bind-error settlement.
