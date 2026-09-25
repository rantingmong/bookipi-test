import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import { CheckoutResult } from '../checkout/feature.js'
import { responseHeaders } from './constants.js'

export function approvedRequestOrigin(event: APIGatewayProxyEvent) {
  const configuredOrigin = process.env.STOREFRONT_ORIGIN
  if (!configuredOrigin) return undefined
  const header = Object.entries(event.headers ?? {}).find(
    ([name]) => name.toLowerCase() === 'origin',
  )
  if (!header || header[1] !== configuredOrigin) return undefined
  return configuredOrigin
}

export function response(
  statusCode: number,
  body: unknown,
  origin?: string,
): APIGatewayProxyResult {
  const headers: Record<string, string> = { ...responseHeaders }
  if (origin) {
    headers['access-control-allow-origin'] = origin
    headers['access-control-allow-credentials'] = 'true'
    headers.vary = 'Origin'
  }
  return {
    statusCode,
    headers,
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
  origin?: string,
): APIGatewayProxyResult {
  if (result.status === 'PENDING') return response(202, result, origin)
  if (result.status === 'unpublished') {
    return response(409, { error: 'LISTING_UNPUBLISHED' }, origin)
  }
  if (result.status === 'closed')
    return response(409, { error: 'SALE_CLOSED' }, origin)
  if (result.status === 'sold-out')
    return response(409, { error: 'SOLD_OUT' }, origin)
  if (result.status === 'already-active') {
    return response(409, { error: 'ACTIVE_ORDER_EXISTS' }, origin)
  }
  if (result.status === 'cancelled') {
    return response(409, { error: 'RESERVATION_CANCELLED' }, origin)
  }
  return response(503, { error: 'CHECKOUT_RETRYABLE' }, origin)
}
