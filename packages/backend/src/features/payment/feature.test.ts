import {
  applyPaymentOutcome,
  PaymentOutcomeConflictError,
  paymentOutcomeSchema,
} from '#features/payment/feature'
import { describe, expect, it, vi } from 'vitest'
import type { Models } from '#types'

function createModels(OrdersModel: object): Models {
  return {
    ListingModel: {},
    ListingSlotModel: {},
    OrdersModel,
  } as unknown as Models
}

describe('payment feature', () => {
  it('applies success and accepts the same terminal status on retry', async () => {
    const complete = { orderId: 'order-001', status: 'COMPLETE' }
    const findOneAndUpdate = vi.fn(async () => complete)
    const findOne = vi.fn(async () => complete)
    const model = { findOneAndUpdate, findOne }

    await expect(
      applyPaymentOutcome(createModels(model), 'order-001', 'success'),
    ).resolves.toEqual(complete)
    expect(findOneAndUpdate).toHaveBeenCalledWith(
      { orderId: 'order-001', status: 'PENDING' },
      { $set: { status: 'COMPLETE' } },
      { returnDocument: 'after' },
    )

    findOneAndUpdate.mockResolvedValueOnce(null as never)
    await expect(
      applyPaymentOutcome(createModels(model), 'order-001', 'success'),
    ).resolves.toEqual(complete)
  })

  it.each(['failure', 'expired'] as const)(
    'maps %s to CANCELLED',
    async (outcome) => {
      const findOneAndUpdate = vi.fn(async () => ({ status: 'CANCELLED' }))
      const findOne = vi.fn()

      await applyPaymentOutcome(
        createModels({ findOneAndUpdate, findOne }),
        'order-001',
        outcome,
      )

      expect(findOneAndUpdate).toHaveBeenCalledWith(
        { orderId: 'order-001', status: 'PENDING' },
        {
          $set: { status: 'CANCELLED', releaseStatus: 'PENDING' },
        },
        { returnDocument: 'after' },
      )
      expect(findOne).not.toHaveBeenCalled()
    },
  )

  it('keeps a pending or completed release intent on a same-status retry', async () => {
    for (const releaseStatus of ['PENDING', 'COMPLETE'] as const) {
      const cancelled = {
        orderId: 'order-001',
        status: 'CANCELLED',
        releaseStatus,
      }
      const findOneAndUpdate = vi.fn(async () => null)
      const findOne = vi.fn(async () => cancelled)

      await expect(
        applyPaymentOutcome(
          createModels({ findOneAndUpdate, findOne }),
          'order-001',
          'failure',
        ),
      ).resolves.toEqual(cancelled)
      expect(findOneAndUpdate).toHaveBeenCalledOnce()
      expect(findOne).toHaveBeenCalledOnce()
    }
  })

  it('accepts failure and expiry as the same CANCELLED terminal status', async () => {
    const cancelled = {
      orderId: 'order-001',
      status: 'CANCELLED',
      releaseStatus: 'PENDING',
    }
    const findOneAndUpdate = vi
      .fn()
      .mockResolvedValueOnce(cancelled)
      .mockResolvedValueOnce(null)
    const findOne = vi.fn(async () => cancelled)
    const model = { findOneAndUpdate, findOne }

    await expect(
      applyPaymentOutcome(createModels(model), 'order-001', 'failure'),
    ).resolves.toEqual(cancelled)
    await expect(
      applyPaymentOutcome(createModels(model), 'order-001', 'expired'),
    ).resolves.toEqual(cancelled)
    expect(findOneAndUpdate).toHaveBeenNthCalledWith(
      2,
      { orderId: 'order-001', status: 'PENDING' },
      { $set: { status: 'CANCELLED', releaseStatus: 'PENDING' } },
      { returnDocument: 'after' },
    )
  })

  it('rejects a different terminal outcome and validates the strict request body', async () => {
    const findOneAndUpdate = vi.fn(async () => null)
    const findOne = vi.fn(async () => ({ status: 'CANCELLED' }))

    await expect(
      applyPaymentOutcome(
        createModels({ findOneAndUpdate, findOne }),
        'order-001',
        'success',
      ),
    ).rejects.toBeInstanceOf(PaymentOutcomeConflictError)
    expect(paymentOutcomeSchema.parse({ outcome: 'success' })).toEqual({
      outcome: 'success',
    })
    expect(() =>
      paymentOutcomeSchema.parse({ outcome: 'success', status: 'COMPLETE' }),
    ).toThrow()
  })
})
