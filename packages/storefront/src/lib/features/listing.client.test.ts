import { afterEach, describe, expect, it, vi } from 'vitest'
import { readListingStatus } from './listing.client'

describe('listing client', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('reads public listing status with credentials and a normalized API URL', async () => {
    const fetchMock = vi.fn<typeof fetch>()
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          listingId: 'flash sale',
          productName: 'Bookipi Pro',
          saleStartsAt: '2026-10-01T10:00:00.000Z',
          saleEndsAt: '2026-10-01T11:00:00.000Z',
          stockTotal: 15,
          reserveSlots: 5,
          publicStock: 10,
        }),
        { status: 200 },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    await readListingStatus('https://api.example.test///', 'flash sale')

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.test/api/listings/flash%20sale',
      expect.objectContaining({ method: 'GET', credentials: 'include' }),
    )
  })
})
