import type {
  APIGatewayAuthorizerResult,
  APIGatewayRequestAuthorizerEvent,
} from 'aws-lambda'
import { authorizeCheckoutRequest } from './features/authorization/feature.js'
import { header, makePolicy, toHeaders } from './features/lambda/feature.js'
import { getRuntime } from './runtime.js'

export async function handler(
  event: APIGatewayRequestAuthorizerEvent,
): Promise<APIGatewayAuthorizerResult> {
  const customerId = await authorizeCheckoutRequest({
    origin: header(event, 'origin'),
    configuredOrigin: process.env.STOREFRONT_ORIGIN,
    cookie: header(event, 'cookie'),
    headers: toHeaders(event),
    readSession: (input) => getRuntime().getSession(input),
  })

  if (!customerId) {
    return makePolicy(event, 'Deny', 'anonymous')
  }

  return makePolicy(event, 'Allow', customerId, customerId)
}
