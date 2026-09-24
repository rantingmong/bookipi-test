import type { APIGatewayProxyEvent } from 'aws-lambda'
import { describe, expect, it } from 'vitest'
import type { CheckoutResult } from '../checkout/feature.js'
import { responseHeaders } from './constants.js'
import { checkoutResponse, requestBody, response } from './feature.js'

function event(
  body: string | null,
  isBase64Encoded = false,
): APIGatewayProxyEvent {
  return { body, isBase64Encoded } as APIGatewayProxyEvent
}

describe('Lambda HTTP helpers', () => {
  it('returns a JSON body and content type header', () => {
    expect(response(201, { ok: true })).toEqual({
      statusCode: 201,
      headers: responseHeaders,
      body: '{"ok":true}',
    })
  })

  it('parses a plain JSON request body', () => {
    expect(requestBody(event('{"listingId":"sale-1"}'))).toEqual({
      listingId: 'sale-1',
    })
  })

  it('decodes and parses a base64 request body', () => {
    const body = Buffer.from('{"listingId":"sale-1"}').toString('base64')

    expect(requestBody(event(body, true))).toEqual({ listingId: 'sale-1' })
  })

  it('rejects a missing request body', () => {
    expect(() => requestBody(event(null))).toThrow('Missing request body')
  })

  it('rejects malformed JSON', () => {
    expect(() => requestBody(event('{'))).toThrow()
  })

  it.each([
    [
      'pending',
      { orderId: '00000000-0000-4000-8000-000000000001', status: 'PENDING' },
      202,
      { orderId: '00000000-0000-4000-8000-000000000001', status: 'PENDING' },
    ],
    [
      'unpublished',
      { status: 'unpublished' },
      409,
      { error: 'LISTING_UNPUBLISHED' },
    ],
    ['closed', { status: 'closed' }, 409, { error: 'SALE_CLOSED' }],
    ['sold out', { status: 'sold-out' }, 409, { error: 'SOLD_OUT' }],
    [
      'already active',
      { status: 'already-active' },
      409,
      { error: 'ACTIVE_ORDER_EXISTS' },
    ],
    [
      'cancelled',
      { status: 'cancelled' },
      409,
      { error: 'RESERVATION_CANCELLED' },
    ],
    [
      'unavailable',
      { status: 'unavailable' },
      503,
      { error: 'CHECKOUT_RETRYABLE' },
    ],
  ] satisfies Array<[string, CheckoutResult, number, unknown]>)(
    'maps the %s checkout result',
    (_name, result, statusCode, body) => {
      expect(checkoutResponse(result)).toEqual({
        statusCode,
        headers: responseHeaders,
        body: JSON.stringify(body),
      })
    },
  )
})
