import { describe, expect, it, vi } from 'vitest'
import {
  applyPaymentOutcome,
  PaymentOutcomeConflictError,
  paymentOutcomeSchema,
} from '#features/payment/feature'

describe('payment feature', () => {
  it('applies success and accepts the same outcome on retry', async () => {
    const complete = { orderId: 'order-001', status: 'COMPLETE' }
    const findOneAndUpdate = vi.fn(async () => complete)
    const findOne = vi.fn(async () => complete)
    const model = { findOneAndUpdate, findOne }

    await expect(
      applyPaymentOutcome(model as never, 'order-001', 'success'),
    ).resolves.toEqual(complete)
    expect(findOneAndUpdate).toHaveBeenCalledWith(
      { orderId: 'order-001', status: 'PENDING' },
      { $set: { status: 'COMPLETE' } },
      { returnDocument: 'after' },
    )

    findOneAndUpdate.mockResolvedValueOnce(null as never)
    await expect(
      applyPaymentOutcome(model as never, 'order-001', 'success'),
    ).resolves.toEqual(complete)
  })

  it.each(['failure', 'expired'] as const)(
    'maps %s to CANCELLED',
    async (outcome) => {
      const findOneAndUpdate = vi.fn(async () => ({ status: 'CANCELLED' }))
      const findOne = vi.fn()

      await applyPaymentOutcome(
        { findOneAndUpdate, findOne } as never,
        'order-001',
        outcome,
      )

      expect(findOneAndUpdate).toHaveBeenCalledWith(
        { orderId: 'order-001', status: 'PENDING' },
        { $set: { status: 'CANCELLED' } },
        { returnDocument: 'after' },
      )
      expect(findOne).not.toHaveBeenCalled()
    },
  )

  it('rejects a different terminal outcome and validates the strict request body', async () => {
    const findOneAndUpdate = vi.fn(async () => null)
    const findOne = vi.fn(async () => ({ status: 'CANCELLED' }))

    await expect(
      applyPaymentOutcome(
        { findOneAndUpdate, findOne } as never,
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
