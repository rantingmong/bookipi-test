import { SQSClient } from '@aws-sdk/client-sqs'
import { createCandidateOrderId } from './features/checkout/feature.js'
import { parseEnvironment } from './features/env/feature.js'
import { claimAvailableSlot } from './features/inventory/feature.js'
import { startPaymentSession } from './features/payment/feature.js'
import { publishOrderReservedEvent } from './services/sqs/feature.js'
import { createValkeyClient } from './services/valkey/feature.js'
import type { CheckoutDependencies, RuntimeClients } from '#types'

let runtime: RuntimeClients | undefined

export function getClients(): RuntimeClients {
  if (runtime) return runtime

  const environment = parseEnvironment(process.env)
  runtime = {
    valkey: createValkeyClient(environment.VALKEY_URL),
    sqs: new SQSClient({}),
    queueUrl: environment.ORDER_EVENTS_QUEUE_URL,
  }
  return runtime
}

export function getDependencies(clients: RuntimeClients): CheckoutDependencies {
  return {
    claim: (claimInput) => {
      return claimAvailableSlot(clients.valkey, claimInput)
    },
    publish: (event) => {
      return publishOrderReservedEvent(clients.sqs, clients.queueUrl, event)
    },
    createOrderId: createCandidateOrderId,
    startPaymentSession,
  } satisfies CheckoutDependencies
}
