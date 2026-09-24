import { describe, expect, it, vi } from 'vitest'
import type { CheckoutDependencies } from '#types'
import { checkoutInputSchema, startCheckout } from './feature.js'

const candidateOrderId = '00000000-0000-4000-8000-000000000001'

function createDependencies(
  claim: CheckoutDependencies['claim'],
): CheckoutDependencies {
  return {
    claim,
    publish: vi.fn().mockResolvedValue(undefined),
    createOrderId: vi.fn(() => candidateOrderId),
    startPaymentSession: vi.fn((orderId) => ({
      redirectUrl: `/payment?orderId=${encodeURIComponent(orderId)}`,
    })),
  }
}

describe('checkout feature', () => {
  it('accepts the same safe listing IDs as listing creation', () => {
    for (const listingId of ['flash-sale-2026', 'Flash_Sale_26', 'sale9']) {
      expect(
        checkoutInputSchema.parse({ listingId, idempotencyKey: 'key-1' })
          .listingId,
      ).toBe(listingId)
    }
    for (const listingId of ['sale:{other}', 'sale.one', 'a'.repeat(129)]) {
      expect(() =>
        checkoutInputSchema.parse({ listingId, idempotencyKey: 'key-1' }),
      ).toThrow()
    }
  })

  it('validates only the listing and client idempotency key', () => {
    expect(
      checkoutInputSchema.parse({
        listingId: 'sale-1',
        idempotencyKey: 'checkout-attempt-1',
        customerId: 'browser-value-is-ignored',
      }),
    ).toEqual({ listingId: 'sale-1', idempotencyKey: 'checkout-attempt-1' })
    expect(() => checkoutInputSchema.parse({ listingId: 'sale-1' })).toThrow()
    expect(() =>
      checkoutInputSchema.parse({ listingId: '', idempotencyKey: '' }),
    ).toThrow()
  })

  it('uses the candidate order ID to claim and publish a reservation', async () => {
    const claim = vi.fn().mockResolvedValue({
      status: 'reserved',
      orderId: candidateOrderId,
      slotId: 'sale-1:slot:0001',
    })
    const dependencies = createDependencies(claim)

    const result = await startCheckout(
      { listingId: 'sale-1', idempotencyKey: 'key-1' },
      'customer-1',
      dependencies,
    )

    expect(result).toEqual({
      orderId: candidateOrderId,
      status: 'PENDING',
      redirectUrl: `/payment?orderId=${candidateOrderId}`,
    })
    expect(dependencies.createOrderId).toHaveBeenCalledOnce()
    expect(claim).toHaveBeenCalledWith({
      listingId: 'sale-1',
      customerId: 'customer-1',
      idempotencyKey: 'key-1',
      candidateOrderId,
    })
    expect(dependencies.publish).toHaveBeenCalledWith({
      eventType: 'order-reserved.v1',
      orderId: candidateOrderId,
      customerId: 'customer-1',
      listingId: 'sale-1',
      slotId: 'sale-1:slot:0001',
    })
    expect(dependencies.startPaymentSession).toHaveBeenCalledWith(
      candidateOrderId,
    )
    const publishOrder = vi.mocked(dependencies.publish).mock
      .invocationCallOrder[0]
    const sessionOrder = vi.mocked(dependencies.startPaymentSession).mock
      .invocationCallOrder[0]
    expect(publishOrder).toBeDefined()
    expect(sessionOrder).toBeDefined()
    expect(publishOrder).toBeLessThan(sessionOrder ?? 0)
  })

  it('publishes the original reservation when a same-key retry finds it', async () => {
    const retryOrderId = '00000000-0000-4000-8000-000000000002'
    const claim = vi.fn().mockResolvedValue({
      status: 'reserved',
      orderId: retryOrderId,
      slotId: 'sale-1:slot:0001',
    })
    const dependencies = createDependencies(claim)

    const result = await startCheckout(
      { listingId: 'sale-1', idempotencyKey: 'same-key' },
      'customer-1',
      dependencies,
    )

    expect(result).toEqual({
      orderId: retryOrderId,
      status: 'PENDING',
      redirectUrl: `/payment?orderId=${retryOrderId}`,
    })
    expect(dependencies.startPaymentSession).toHaveBeenCalledWith(retryOrderId)
    expect(claim).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: 'same-key' }),
    )
    expect(dependencies.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: '00000000-0000-4000-8000-000000000002',
        slotId: 'sale-1:slot:0001',
      }),
    )
  })

  it('does not publish when the claim has no reservation', async () => {
    const dependencies = createDependencies(
      vi.fn().mockResolvedValue({ status: 'sold-out' }),
    )

    await expect(
      startCheckout(
        { listingId: 'sale-1', idempotencyKey: 'key-1' },
        'customer-1',
        dependencies,
      ),
    ).resolves.toEqual({ status: 'sold-out' })
    expect(dependencies.publish).not.toHaveBeenCalled()
    expect(dependencies.startPaymentSession).not.toHaveBeenCalled()
  })

  it('propagates a reservation publication failure', async () => {
    const dependencies = createDependencies(
      vi.fn().mockResolvedValue({
        status: 'reserved',
        orderId: candidateOrderId,
        slotId: 'sale-1:slot:0001',
      }),
    )
    vi.mocked(dependencies.publish).mockRejectedValue(
      new Error('SQS unavailable'),
    )

    await expect(
      startCheckout(
        { listingId: 'sale-1', idempotencyKey: 'key-1' },
        'customer-1',
        dependencies,
      ),
    ).rejects.toThrow('SQS unavailable')
    expect(dependencies.publish).toHaveBeenCalledOnce()
    expect(dependencies.startPaymentSession).not.toHaveBeenCalled()
  })
})
