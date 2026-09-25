import { afterEach, describe, expect, it, vi } from 'vitest'
import { CheckoutRequestError, submitCheckout } from './checkout.client'
import { classifyCheckoutFailure } from './checkout-failure'

describe('checkout failure classification', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('maps a 401 response to unauthenticated without rechecking the session', async () => {
    const revalidateSession = vi.fn<() => Promise<boolean>>()
    const failure = await classifyCheckoutFailure(
      new CheckoutRequestError('CHECKOUT_RETRYABLE', 401),
      revalidateSession,
    )

    expect(failure).toMatchObject({
      code: 'UNAUTHENTICATED',
      status: 401,
    })
    expect(revalidateSession).not.toHaveBeenCalled()
  })

  it('maps UNAUTHENTICATED errors to sign-in without rechecking the session', async () => {
    const revalidateSession = vi.fn<() => Promise<boolean>>()
    const failure = await classifyCheckoutFailure(
      new CheckoutRequestError('UNAUTHENTICATED', 403),
      revalidateSession,
    )

    expect(failure).toMatchObject({ code: 'UNAUTHENTICATED' })
    expect(revalidateSession).not.toHaveBeenCalled()
  })

  it('maps a network failure to unauthenticated when revalidation finds no session', async () => {
    const revalidateSession = vi
      .fn<() => Promise<boolean>>()
      .mockResolvedValue(false)
    const failure = await classifyCheckoutFailure(
      new TypeError('Failed to fetch'),
      revalidateSession,
    )

    expect(failure).toMatchObject({
      code: 'UNAUTHENTICATED',
      status: 401,
    })
    expect(revalidateSession).toHaveBeenCalledOnce()
  })

  it('keeps a network failure retryable when revalidation finds an active session', async () => {
    const networkFailure = new TypeError('Failed to fetch')
    const revalidateSession = vi
      .fn<() => Promise<boolean>>()
      .mockResolvedValue(true)
    const failure = await classifyCheckoutFailure(
      networkFailure,
      revalidateSession,
    )

    expect(failure).toBe(networkFailure)
    expect(revalidateSession).toHaveBeenCalledOnce()
  })

  it('keeps a network failure retryable when session revalidation fails', async () => {
    const networkFailure = new TypeError('Failed to fetch')
    const revalidateSession = vi
      .fn<() => Promise<boolean>>()
      .mockRejectedValue(new Error('Session check failed'))
    const failure = await classifyCheckoutFailure(
      networkFailure,
      revalidateSession,
    )

    expect(failure).toBe(networkFailure)
  })

  it('maps an ambiguous readable 403 to unauthenticated when no session exists', async () => {
    const revalidateSession = vi
      .fn<() => Promise<boolean>>()
      .mockResolvedValue(false)
    const failure = await classifyCheckoutFailure(
      new CheckoutRequestError('CHECKOUT_RETRYABLE', 403, false),
      revalidateSession,
    )

    expect(failure).toMatchObject({
      code: 'UNAUTHENTICATED',
      status: 401,
    })
    expect(revalidateSession).toHaveBeenCalledOnce()
  })

  it('revalidates a generic Forbidden 403 and maps an absent session', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 }),
      )
    vi.stubGlobal('fetch', fetchMock)
    const revalidateSession = vi
      .fn<() => Promise<boolean>>()
      .mockResolvedValue(false)
    let failure: unknown

    try {
      await submitCheckout('https://checkout.example.test', 'sale-1', 'key-1')
    } catch (error) {
      failure = await classifyCheckoutFailure(error, revalidateSession)
    }

    expect(failure).toMatchObject({
      code: 'UNAUTHENTICATED',
      status: 401,
    })
    expect(revalidateSession).toHaveBeenCalledOnce()
  })

  it('revalidates an invalid JSON 403 and maps an absent session', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('Forbidden', { status: 403 }))
    vi.stubGlobal('fetch', fetchMock)
    const revalidateSession = vi
      .fn<() => Promise<boolean>>()
      .mockResolvedValue(false)
    let failure: unknown

    try {
      await submitCheckout('https://checkout.example.test', 'sale-1', 'key-1')
    } catch (error) {
      failure = await classifyCheckoutFailure(error, revalidateSession)
    }

    expect(failure).toMatchObject({
      code: 'UNAUTHENTICATED',
      status: 401,
    })
    expect(revalidateSession).toHaveBeenCalledOnce()
  })

  it('preserves an invalid JSON 403 after session revalidation finds an active session', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('Forbidden', { status: 403 }))
    vi.stubGlobal('fetch', fetchMock)
    const revalidateSession = vi
      .fn<() => Promise<boolean>>()
      .mockResolvedValue(true)
    let failure: unknown

    try {
      await submitCheckout('https://checkout.example.test', 'sale-1', 'key-1')
    } catch (error) {
      failure = await classifyCheckoutFailure(error, revalidateSession)
    }

    expect(failure).toMatchObject({
      code: 'CHECKOUT_RETRYABLE',
      status: 403,
      hasExplicitCheckoutCode: false,
    })
    expect(revalidateSession).toHaveBeenCalledOnce()
  })

  it('keeps an ambiguous readable 403 retryable when a session exists', async () => {
    const denial = new CheckoutRequestError('CHECKOUT_RETRYABLE', 403, false)
    const revalidateSession = vi
      .fn<() => Promise<boolean>>()
      .mockResolvedValue(true)
    const failure = await classifyCheckoutFailure(denial, revalidateSession)

    expect(failure).toBe(denial)
    expect(revalidateSession).toHaveBeenCalledOnce()
  })

  it.each([
    'ACTIVE_ORDER_EXISTS',
    'SALE_CLOSED',
    'SOLD_OUT',
    'LISTING_UNPUBLISHED',
    'RESERVATION_CANCELLED',
  ])(
    'preserves the explicit %s error without session revalidation',
    async (code) => {
      const error = new CheckoutRequestError(code, 409)
      const revalidateSession = vi.fn<() => Promise<boolean>>()
      const failure = await classifyCheckoutFailure(error, revalidateSession)

      expect(failure).toBe(error)
      expect(revalidateSession).not.toHaveBeenCalled()
    },
  )
})
