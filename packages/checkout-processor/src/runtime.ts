import { redisStorage } from '@better-auth/redis-storage'
import { SQSClient } from '@aws-sdk/client-sqs'
import { betterAuth } from 'better-auth'
import { createCandidateOrderId } from './features/checkout/feature.js'
import {
  parseEnvironment,
  parseLocalAdapterEnvironment,
} from './features/env/feature.js'
import { claimAvailableSlot } from './features/inventory/feature.js'
import { startPaymentSession } from './features/payment/feature.js'
import { publishOrderReservedEvent } from './services/sqs/feature.js'
import { createValkeyClient } from './services/valkey/feature.js'
import type { CheckoutDependencies, RuntimeClients } from '#types'

let runtime: RuntimeClients | undefined
type SessionInput = {
  headers: Headers
  query: { disableRefresh: true; disableCookieCache: true }
}
type SessionResult = { user: { id: string } } | null
let localAuthRuntime:
  { getSession: (input: SessionInput) => Promise<SessionResult> } | undefined

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

export function getLocalAuthRuntime() {
  if (localAuthRuntime) return localAuthRuntime

  const environment = parseLocalAdapterEnvironment(process.env)
  const client = createValkeyClient(environment.VALKEY_URL)
  const auth = betterAuth({
    appName: 'Bookipi Flash Sale',
    baseURL: environment.BETTER_AUTH_URL,
    secret: environment.BETTER_AUTH_SECRET,
    secondaryStorage: redisStorage({ client, keyPrefix: 'bookipi:auth:' }),
    session: { storeSessionInDatabase: false },
  })
  localAuthRuntime = {
    getSession: (input) => auth.api.getSession(input),
  }
  return localAuthRuntime
}
