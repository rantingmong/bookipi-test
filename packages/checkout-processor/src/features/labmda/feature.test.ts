import type { APIGatewayProxyEvent } from 'aws-lambda'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CheckoutResult } from '../checkout/feature.js'
import { responseHeaders } from './constants.js'
import {
  checkoutResponse,
  approvedRequestOrigin,
  eventHeader,
  isExactHttpOrigin,
  requestBody,
  response,
} from './feature.js'

function event(
  body: string | null,
  isBase64Encoded = false,
  headers: Record<string, string> = {},
): APIGatewayProxyEvent {
  return { body, isBase64Encoded, headers } as APIGatewayProxyEvent
}

describe('Lambda HTTP helpers', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('reads request headers without depending on their case', () => {
    expect(
      eventHeader(
        {
          headers: { Origin: 'https://store.example.test' },
        } as unknown as APIGatewayProxyEvent,
        'origin',
      ),
    ).toBe('https://store.example.test')
  })

  it('accepts only an exact HTTP origin', () => {
    expect(isExactHttpOrigin('https://store.example.test')).toBe(true)
    expect(isExactHttpOrigin('https://store.example.test/path')).toBe(false)
    expect(isExactHttpOrigin('not an origin')).toBe(false)
    expect(isExactHttpOrigin(undefined)).toBe(false)
  })

  it('approves only an exact configured request origin', () => {
    vi.stubEnv('STOREFRONT_ORIGIN', 'https://store.example.test')

    expect(
      approvedRequestOrigin(
        event(null, false, { Origin: 'https://store.example.test' }),
      ),
    ).toBe('https://store.example.test')
    expect(
      approvedRequestOrigin(
        event(null, false, { Origin: 'https://store.example.test/path' }),
      ),
    ).toBeUndefined()

    vi.stubEnv('STOREFRONT_ORIGIN', 'https://store.example.test/path')
    expect(
      approvedRequestOrigin(
        event(null, false, { Origin: 'https://store.example.test/path' }),
      ),
    ).toBeUndefined()
  })

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
      {
        orderId: '00000000-0000-4000-8000-000000000001',
        status: 'PENDING',
        redirectUrl: '/payment?orderId=00000000-0000-4000-8000-000000000001',
      },
      202,
      {
        orderId: '00000000-0000-4000-8000-000000000001',
        status: 'PENDING',
        redirectUrl: '/payment?orderId=00000000-0000-4000-8000-000000000001',
      },
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
