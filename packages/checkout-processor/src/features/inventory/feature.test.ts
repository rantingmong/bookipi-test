import { describe, expect, it, vi } from 'vitest'
import { claimAvailableSlot } from './feature.js'

describe('checkout inventory feature', () => {
  it('claims a slot for the listing, trusted customer, and client key', async () => {
    const evalScript = vi.fn(async (..._args: unknown[]) => [
      'RESERVED',
      'order-1',
      'sale-1:slot:0001',
    ])

    await expect(
      claimAvailableSlot({ eval: evalScript } as never, {
        listingId: 'sale-1',
        customerId: 'customer-1',
        idempotencyKey: 'checkout-attempt-1',
        candidateOrderId: 'order-1',
      }),
    ).resolves.toEqual({
      status: 'reserved',
      orderId: 'order-1',
      slotId: 'sale-1:slot:0001',
    })

    const script = evalScript.mock.calls[0]?.[0]
    expect(script).toContain("redis.call('LPOP'")
    expect(script).toContain("redis.call('TIME')")
    const keyArguments = [
      ...String(script).matchAll(/redis\.call\('[A-Z]+',\s*([^,\s)]+)/g),
    ].map((match) => String(match[1]))
    expect(keyArguments.every((key) => /^KEYS\[\d+\]$/.test(key))).toBe(true)
    expect(script).not.toContain('local orderKey =')
    expect(script).toContain("idempotencyOrderId .. ':status'")
    expect(script).toContain("candidateOrderId .. ':'")
    expect(evalScript.mock.calls[0]?.[1]).toBe(5)
    expect(evalScript.mock.calls[0]?.slice(2, 7)).toEqual([
      'sale:{sale-1}:meta',
      'sale:{sale-1}:available-slots',
      'sale:{sale-1}:idempotency',
      'sale:{sale-1}:active-customers',
      'sale:{sale-1}:orders',
    ])
  })

  it('returns the original order and slot for the same idempotency tuple', async () => {
    const evalScript = vi.fn(async (..._args: unknown[]) => [
      'RESERVED',
      'original-order',
      'sale-1:slot:0001',
    ])

    await expect(
      claimAvailableSlot({ eval: evalScript } as never, {
        listingId: 'sale-1',
        customerId: 'customer-1',
        idempotencyKey: 'same-key',
        candidateOrderId: 'new-candidate',
      }),
    ).resolves.toEqual({
      status: 'reserved',
      orderId: 'original-order',
      slotId: 'sale-1:slot:0001',
    })
  })

  it.each([
    ['unpublished', 'UNPUBLISHED'],
    ['closed', 'CLOSED'],
    ['sold out', 'SOLD_OUT'],
    ['already active', 'ALREADY_ACTIVE'],
    ['cancelled', 'CANCELLED'],
  ])('reports the %s outcome from the atomic claim', async (_label, result) => {
    const evalScript = vi.fn(async (..._args: unknown[]) => [result])

    await expect(
      claimAvailableSlot({ eval: evalScript } as never, {
        listingId: 'sale-1',
        customerId: 'customer-1',
        idempotencyKey: 'attempt-2',
        candidateOrderId: 'order-2',
      }),
    ).resolves.toMatchObject({
      status: result?.toLowerCase().replace('_', '-'),
    })
  })
})
