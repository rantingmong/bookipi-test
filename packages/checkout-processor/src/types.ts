import type { SQSClient } from '@aws-sdk/client-sqs'
import type { OrderReservedEvent } from './features/checkout/schema.js'
import type { InventoryClaim } from './features/inventory/feature.js'
import { createValkeyClient } from './services/valkey/feature.js'

export type RuntimeClients = {
  valkey: ReturnType<typeof createValkeyClient>
  sqs: SQSClient
  queueUrl: string
}

export type CheckoutDependencies = {
  claim: (input: {
    listingId: string
    customerId: string
    idempotencyKey: string
    candidateOrderId: string
  }) => Promise<InventoryClaim>
  publish: (event: OrderReservedEvent) => Promise<void>
  createOrderId: () => string
}
