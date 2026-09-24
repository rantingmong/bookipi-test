import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import { CheckoutResult } from '../checkout/feature.js'
import { responseHeaders } from './constants.js'

export function response(
  statusCode: number,
  body: unknown,
): APIGatewayProxyResult {
  return {
    statusCode,
    headers: responseHeaders,
    body: JSON.stringify(body),
  }
}

export function requestBody(event: APIGatewayProxyEvent): unknown {
  if (typeof event.body !== 'string') throw new Error('Missing request body')
  let body = event.body
  if (event.isBase64Encoded) body = Buffer.from(body, 'base64').toString('utf8')
  return JSON.parse(body) as unknown
}

export function checkoutResponse(
  result: CheckoutResult,
): APIGatewayProxyResult {
  if (result.status === 'PENDING') return response(202, result)
  if (result.status === 'unpublished') {
    return response(409, { error: 'LISTING_UNPUBLISHED' })
  }
  if (result.status === 'closed') return response(409, { error: 'SALE_CLOSED' })
  if (result.status === 'sold-out') return response(409, { error: 'SOLD_OUT' })
  if (result.status === 'already-active') {
    return response(409, { error: 'ACTIVE_ORDER_EXISTS' })
  }
  if (result.status === 'cancelled') {
    return response(409, { error: 'RESERVATION_CANCELLED' })
  }
  return response(503, { error: 'CHECKOUT_RETRYABLE' })
}
