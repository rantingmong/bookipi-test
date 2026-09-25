# SQS service

## Purpose

This service receives and acknowledges order reservation events from SQS.

## Flow

The worker long-polls up to ten messages for 20 seconds. The service parses each body with the strict `order-reserved.v1` schema. It deletes a message only after the order feature confirms MongoDB persistence.

## Decisions & assumptions

- The event contains `orderId`, `customerId`, `listingId`, and `slotId` facts.
- A malformed body or missing receipt handle is not acknowledged.
- The queue deployment owns visibility, retry, and dead-letter settings.
- Set optional `SQS_ENDPOINT_URL` to the LocalStack endpoint in the local stack. Leave it unset for AWS.
- The service does not connect to AWS during import.

## Change log

### 2026-09-24

- Added SQS long polling, strict event parsing, and explicit acknowledgement.
