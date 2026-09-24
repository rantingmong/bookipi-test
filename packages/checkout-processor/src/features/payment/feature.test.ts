import { describe, expect, it } from 'vitest'
import { startPaymentSession } from './feature.js'

describe('payment feature', () => {
  it('returns a relative payment redirect for the order ID', () => {
    expect(startPaymentSession('00000000-0000-4000-8000-000000000001')).toEqual(
      { redirectUrl: '/payment?orderId=00000000-0000-4000-8000-000000000001' },
    )
  })

  it('encodes UUID input before adding it to the redirect', () => {
    const redirect = startPaymentSession(
      '00000000-0000-4000-8000-000000000001',
    ).redirectUrl

    expect(redirect).toBe(
      '/payment?orderId=00000000-0000-4000-8000-000000000001',
    )
  })

  it('rejects an order ID outside the UUID contract', () => {
    expect(() => startPaymentSession('order-001')).toThrow()
  })
})
