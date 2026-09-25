import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import { startCheckout } from './features/checkout/feature.js'
import { checkoutInputSchema } from './features/checkout/schema.js'
import { trustedCustomerId } from './features/customer/feature.js'
import {
  approvedRequestOrigin,
  checkoutResponse,
  requestBody,
  response,
} from './features/labmda/feature.js'
import { getClients, getDependencies } from './runtime.js'

export async function handler(
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> {
  const origin = approvedRequestOrigin(event)
  const customerId = trustedCustomerId(event)
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
    const clients = getClients()
    const dependencies = getDependencies(clients)
    return checkoutResponse(
      await startCheckout(request.data, customerId, dependencies),
      origin,
    )
  } catch {
    return response(503, { error: 'CHECKOUT_RETRYABLE' }, origin)
  }
}
