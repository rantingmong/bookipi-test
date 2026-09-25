import { describe, expect, it } from 'vitest'
import { parseEnvironment, parseLocalAdapterEnvironment } from './feature.js'

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

  it('requires local auth settings only for the local adapter', () => {
    const settings = {
      VALKEY_URL: 'redis://localhost:6379',
      ORDER_EVENTS_QUEUE_URL: 'http://localhost:4566/000000000000/order-events',
      STOREFRONT_ORIGIN: 'http://bookipi.localhost:3200',
      BETTER_AUTH_URL: 'http://bookipi.localhost:3200',
      BETTER_AUTH_SECRET: 'test-secret',
    }

    expect(parseEnvironment(settings)).toMatchObject({
      VALKEY_URL: settings.VALKEY_URL,
      ORDER_EVENTS_QUEUE_URL: settings.ORDER_EVENTS_QUEUE_URL,
    })
    expect(parseLocalAdapterEnvironment(settings)).toEqual(settings)
    expect(() => parseLocalAdapterEnvironment({})).toThrow()
    expect(() =>
      parseLocalAdapterEnvironment({
        ...settings,
        STOREFRONT_ORIGIN: 'http://bookipi.localhost:3200/path',
      }),
    ).toThrow()
  })
})
