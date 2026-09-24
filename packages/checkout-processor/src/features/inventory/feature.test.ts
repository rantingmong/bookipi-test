import { describe, expect, it, vi } from 'vitest'
import { claimAvailableSlot } from './feature.js'

describe('checkout inventory feature', () => {
  it('atomically pops one slot and assigns it to the order', async () => {
    const evalScript = vi.fn(async (..._args: unknown[]) => 'sale-1:slot:0001')

    await expect(
      claimAvailableSlot({ eval: evalScript } as never, {
        listingId: 'sale-1',
        orderId: 'order-1',
      }),
    ).resolves.toBe('sale-1:slot:0001')
    expect(evalScript.mock.calls[0]?.[0]).toContain("redis.call('LPOP'")
    expect(evalScript.mock.calls[0]?.[0]).toContain("redis.call('HSET'")
  })

  it('returns no slot when the shared pool is empty', async () => {
    await expect(
      claimAvailableSlot({ eval: vi.fn(async () => null) } as never, {
        listingId: 'sale-1',
        orderId: 'order-1',
      }),
    ).resolves.toBeNull()
  })

  it('checks the sale window with Valkey time inside the atomic claim', async () => {
    const evalScript = vi.fn(async (..._args: unknown[]) => null)

    await claimAvailableSlot({ eval: evalScript } as never, {
      listingId: 'sale-1',
      orderId: 'order-1',
    })
    const script = evalScript.mock.calls[0]?.[0]
    expect(script).toContain("redis.call('TIME')")
    expect(script).toContain("redis.call('HGET', KEYS[1], 'saleStartsAt')")
    expect(script).toContain('nowMilliseconds >= saleEndsAt')
  })
})
