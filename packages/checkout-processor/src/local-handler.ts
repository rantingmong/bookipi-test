import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import { authenticateCheckoutSession } from './features/authentication/feature.js'
import { startCheckout } from './features/checkout/feature.js'
import { checkoutInputSchema } from './features/checkout/schema.js'
import {
  approvedRequestOrigin,
  checkoutResponse,
  requestBody,
  response,
} from './features/labmda/feature.js'
import { getClients, getDependencies, getLocalAuthRuntime } from './runtime.js'

export async function handler(
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> {
  console.info('LOCAL_CHECKOUT_ADAPTER_INVOKED')
  const origin = approvedRequestOrigin(event)
  if (!origin) {
    return response(401, { error: 'UNAUTHENTICATED' })
  }

  let customerId: string | undefined
  try {
    let authRuntime = getLocalAuthRuntime()
    customerId = await authenticateCheckoutSession(
      event,
      authRuntime.getSession,
    )
  } catch {
    return response(503, { error: 'CHECKOUT_RETRYABLE' }, origin)
  }

  if (!customerId) {
    return response(401, { error: 'UNAUTHENTICATED' }, origin)
  }

  let body: unknown
  try {
    body = requestBody(event)
  } catch {
    return response(400, { error: 'INVALID_REQUEST' }, origin)
  }

  const request = checkoutInputSchema.safeParse(body)

  if (!request.success) {
    return response(400, { error: 'INVALID_REQUEST' }, origin)
  }

  try {
    const dependencies = getDependencies(getClients())
    const result = await startCheckout(request.data, customerId, dependencies)
    return checkoutResponse(result, origin)
  } catch {
    return response(503, { error: 'CHECKOUT_RETRYABLE' }, origin)
  }
}
