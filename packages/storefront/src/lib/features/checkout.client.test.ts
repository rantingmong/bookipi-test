import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  checkoutErrorCodes,
  normalizeCheckoutUrl,
  submitCheckout,
} from './checkout.client'

describe('checkout client', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('sends only listing and idempotency fields to the configured endpoint', async () => {
    const fetchMock = vi.fn<typeof fetch>()
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          orderId: 'order-1',
          status: 'PENDING',
          redirectUrl: '/payment?orderId=order-1',
        }),
        { status: 202 },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    await submitCheckout('https://checkout.example.test///', 'sale-1', 'key-1')

    expect(fetchMock).toHaveBeenCalledWith(
      'https://checkout.example.test',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        body: JSON.stringify({ listingId: 'sale-1', idempotencyKey: 'key-1' }),
      }),
    )
  })

  it('returns stable checkout errors and normalizes endpoint slashes', async () => {
    const fetchMock = vi.fn<typeof fetch>()
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: 'SOLD_OUT' }), { status: 409 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      submitCheckout('https://checkout.example.test', 'sale-1', 'key-1'),
    ).rejects.toMatchObject({ code: 'SOLD_OUT', status: 409 })
    expect(normalizeCheckoutUrl('https://checkout.example.test///')).toBe(
      'https://checkout.example.test',
    )
  })

  it.each(checkoutErrorCodes)(
    'marks the stable %s error as an explicit checkout code',
    async (code) => {
      const fetchMock = vi.fn<typeof fetch>()
      fetchMock.mockResolvedValue(
        new Response(JSON.stringify({ error: code }), { status: 403 }),
      )
      vi.stubGlobal('fetch', fetchMock)

      await expect(
        submitCheckout('https://checkout.example.test', 'sale-1', 'key-1'),
      ).rejects.toMatchObject({
        code,
        status: 403,
        hasExplicitCheckoutCode: true,
      })
    },
  )

  it('keeps an explicit unauthenticated response distinct from retryable errors', async () => {
    const fetchMock = vi.fn<typeof fetch>()
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: 'UNAUTHENTICATED' }), {
        status: 401,
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      submitCheckout('https://checkout.example.test', 'sale-1', 'key-1'),
    ).rejects.toMatchObject({ code: 'UNAUTHENTICATED', status: 401 })
  })

  it('keeps an empty 401 explicitly unauthenticated', async () => {
    const fetchMock = vi.fn<typeof fetch>()
    fetchMock.mockResolvedValue(new Response(null, { status: 401 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      submitCheckout('https://checkout.example.test', 'sale-1', 'key-1'),
    ).rejects.toMatchObject({ code: 'UNAUTHENTICATED', status: 401 })
  })

  it('keeps a non-JSON 401 explicitly unauthenticated', async () => {
    const fetchMock = vi.fn<typeof fetch>()
    fetchMock.mockResolvedValue(new Response('Unauthorized', { status: 401 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      submitCheckout('https://checkout.example.test', 'sale-1', 'key-1'),
    ).rejects.toMatchObject({ code: 'UNAUTHENTICATED', status: 401 })
  })

  it('marks a readable API Gateway 403 without a checkout error code as ambiguous', async () => {
    const fetchMock = vi.fn<typeof fetch>()
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          message:
            'User is not authorized to access this resource with an explicit deny',
        }),
        { status: 403 },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      submitCheckout('https://checkout.example.test', 'sale-1', 'key-1'),
    ).rejects.toMatchObject({
      code: 'CHECKOUT_RETRYABLE',
      status: 403,
      hasExplicitCheckoutCode: false,
    })
  })

  it('marks an unknown readable error value as an ambiguous checkout failure', async () => {
    const fetchMock = vi.fn<typeof fetch>()
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      submitCheckout('https://checkout.example.test', 'sale-1', 'key-1'),
    ).rejects.toMatchObject({
      code: 'CHECKOUT_RETRYABLE',
      status: 403,
      hasExplicitCheckoutCode: false,
    })
  })

  it('preserves an invalid JSON 403 as an ambiguous retryable error', async () => {
    const fetchMock = vi.fn<typeof fetch>()
    fetchMock.mockResolvedValue(new Response('Forbidden', { status: 403 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      submitCheckout('https://checkout.example.test', 'sale-1', 'key-1'),
    ).rejects.toMatchObject({
      code: 'CHECKOUT_RETRYABLE',
      status: 403,
      hasExplicitCheckoutCode: false,
    })
  })

  it('keeps a non-JSON success response retryable with its HTTP status', async () => {
    const fetchMock = vi.fn<typeof fetch>()
    fetchMock.mockResolvedValue(new Response('not JSON', { status: 202 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      submitCheckout('https://checkout.example.test', 'sale-1', 'key-1'),
    ).rejects.toMatchObject({
      code: 'CHECKOUT_RETRYABLE',
      status: 202,
    })
  })

  it('keeps a malformed success response retryable with its HTTP status', async () => {
    const fetchMock = vi.fn<typeof fetch>()
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ orderId: 'order-1' }), { status: 202 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      submitCheckout('https://checkout.example.test', 'sale-1', 'key-1'),
    ).rejects.toMatchObject({
      code: 'CHECKOUT_RETRYABLE',
      status: 202,
    })
  })
})
