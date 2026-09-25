import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getOrderPollInterval,
  readCurrentOrder,
  readOrder,
  submitMockPaymentOutcome,
} from './order.client'

const order = {
  orderId: 'order-001',
  customerId: 'customer-001',
  listingId: 'listing-001',
  slotId: 'listing-001:slot:0001',
  status: 'PENDING' as const,
  createdAt: '2026-09-24T00:00:00.000Z',
  updatedAt: '2026-09-24T00:00:00.000Z',
}

describe('order client', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => vi.unstubAllGlobals())

  it('passes credentials to fetch for the cross-origin order read', async () => {
    const fetchMock = vi.fn<typeof fetch>()
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(order), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await readOrder('https://api.example.test/', 'order-001')

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.test/api/orders/order-001',
      expect.objectContaining({ method: 'GET', credentials: 'include' }),
    )
  })

  it("reads the current customer's order for a listing with credentials", async () => {
    const fetchMock = vi.fn<typeof fetch>()
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(order), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await readCurrentOrder('https://api.example.test/', 'listing-001')

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.test/api/orders/current?listingId=listing-001',
      expect.objectContaining({ method: 'GET', credentials: 'include' }),
    )
  })

  it('passes credentials to fetch for the mock outcome request', async () => {
    const fetchMock = vi.fn<typeof fetch>()
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ ...order, status: 'COMPLETE' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await submitMockPaymentOutcome(
      'https://api.example.test/',
      'order-001',
      'success',
    )

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.test/api/orders/order-001/payment-outcome',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        body: JSON.stringify({ outcome: 'success' }),
      }),
    )
  })

  it('returns 404 as a not-persisted result and keeps polling', async () => {
    const fetchMock = vi.fn<typeof fetch>()
    fetchMock
      .mockResolvedValueOnce(new Response('{}', { status: 404 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify(order), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      readOrder('https://api.example.test', 'order-001'),
    ).resolves.toBe(null)
    expect(getOrderPollInterval(null)).toBe(1000)
    await expect(
      readOrder('https://api.example.test', 'order-001'),
    ).resolves.toMatchObject({ orderId: 'order-001' })
    expect(getOrderPollInterval(order)).toBe(0)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('keeps non-404 failures as request errors', async () => {
    const fetchMock = vi.fn<typeof fetch>()
    fetchMock.mockResolvedValue(new Response('{}', { status: 503 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      readOrder('https://api.example.test', 'order-001'),
    ).rejects.toMatchObject({
      status: 503,
    })
  })
})
