import { describe, expect, it } from 'vitest'
import { parseEnvironment } from './feature.js'

describe('checkout processor environment', () => {
  it('requires a Valkey URL and order event queue URL', () => {
    expect(
      parseEnvironment({
        VALKEY_URL: 'rediss://valkey.example:6379',
        ORDER_EVENTS_QUEUE_URL:
          'https://sqs.ap-southeast-1.amazonaws.com/123456789012/order-events',
      }),
    ).toEqual({
      VALKEY_URL: 'rediss://valkey.example:6379',
      ORDER_EVENTS_QUEUE_URL:
        'https://sqs.ap-southeast-1.amazonaws.com/123456789012/order-events',
    })
    expect(() => parseEnvironment({})).toThrow()
  })
})
