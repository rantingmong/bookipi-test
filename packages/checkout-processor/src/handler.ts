import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import { startCheckout } from './features/checkout/feature.js'
import { checkoutInputSchema } from './features/checkout/schema.js'
import {
  checkoutResponse,
  requestBody,
  response,
} from './features/labmda/feature.js'
import { getClients, getDependencies } from './runtime.js'
import { trustedCustomerId } from './features/customer/feature.js'

export async function handler(
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> {
  const customerId = trustedCustomerId(event)
  if (!customerId) {
    return response(401, { error: 'UNAUTHENTICATED' })
  }

  let body: unknown
  try {
    body = requestBody(event)
  } catch {
    return response(400, { error: 'INVALID_REQUEST' })
  }

  const request = checkoutInputSchema.safeParse(body)
  if (!request.success) {
    return response(400, { error: 'INVALID_REQUEST' })
  }

  try {
    const clients = getClients()
    const dependencies = getDependencies(clients)
    return checkoutResponse(
      await startCheckout(request.data, customerId, dependencies),
    )
  } catch {
    return response(503, { error: 'CHECKOUT_RETRYABLE' })
  }
}
