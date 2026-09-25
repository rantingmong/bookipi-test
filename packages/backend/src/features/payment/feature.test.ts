import {
  applyPaymentOutcome,
  PaymentOutcomeConflictError,
  PaymentSlotConflictError,
  PaymentSlotNotFoundError,
  paymentOutcomeSchema,
} from '#features/payment/feature'
import { describe, expect, it, vi } from 'vitest'
import type { Models } from '#types'

function createSession() {
  return {
    withTransaction: vi.fn(async (callback: () => Promise<void>) => callback()),
    endSession: vi.fn(async () => undefined),
  }
}

function createModels(
  OrdersModel: object,
  ListingSlotModel: object = {},
  session = createSession(),
): Models {
  return {
    ListingModel: {},
    ListingSlotModel,
    OrdersModel: {
      ...OrdersModel,
      db: { startSession: vi.fn(async () => session) },
    },
  } as unknown as Models
}

describe('payment feature', () => {
  it('applies success and accepts the same terminal status on retry', async () => {
    const complete = {
      orderId: 'order-001',
      listingId: 'listing-001',
      slotId: 'listing-001:slot:0001',
      customerId: 'customer-001',
      status: 'COMPLETE',
    }
    const findOneAndUpdate = vi.fn(async () => complete)
    const findOrder = vi.fn(async () => complete)
    const model = { findOneAndUpdate, findOne: findOrder }
    const slot = {
      listingId: 'listing-001',
      slotId: 'listing-001:slot:0001',
      state: 'secured',
      orderId: 'order-001',
      customerId: 'customer-001',
    }
    const slotFindOneAndUpdate = vi.fn(async () => slot)
    const findSlot = vi.fn(async () => slot)
    const session = createSession()

    await expect(
      applyPaymentOutcome(
        createModels(
          model,
          {
            findOneAndUpdate: slotFindOneAndUpdate,
            findOne: findSlot,
          },
          session,
        ),
        'order-001',
        'success',
      ),
    ).resolves.toEqual(complete)
    expect(findOneAndUpdate).toHaveBeenCalledWith(
      { orderId: 'order-001', status: 'PENDING' },
      { $set: { status: 'COMPLETE' } },
      { returnDocument: 'after', session },
    )
    expect(slotFindOneAndUpdate).toHaveBeenCalledWith(
      {
        listingId: 'listing-001',
        slotId: 'listing-001:slot:0001',
        state: 'available',
        orderId: { $exists: false },
        customerId: { $exists: false },
      },
      {
        $set: {
          state: 'secured',
          orderId: 'order-001',
          customerId: 'customer-001',
        },
      },
      { returnDocument: 'after', session },
    )

    findOneAndUpdate.mockResolvedValueOnce(null as never)
    slotFindOneAndUpdate.mockResolvedValueOnce(null as never)
    await expect(
      applyPaymentOutcome(
        createModels(
          model,
          {
            findOneAndUpdate: slotFindOneAndUpdate,
            findOne: findSlot,
          },
          session,
        ),
        'order-001',
        'success',
      ),
    ).resolves.toEqual(complete)
    expect(findSlot).toHaveBeenCalledWith(
      {
        listingId: 'listing-001',
        slotId: 'listing-001:slot:0001',
        state: 'secured',
        orderId: 'order-001',
        customerId: 'customer-001',
      },
      null,
      { session },
    )
    expect(findOrder).toHaveBeenCalledOnce()
  })

  it('reports an absent slot after a successful payment', async () => {
    const complete = {
      orderId: 'order-001',
      listingId: 'listing-001',
      slotId: 'slot-001',
      customerId: 'customer-001',
      status: 'COMPLETE',
    }
    const orders = {
      findOneAndUpdate: vi.fn(async () => complete),
      findOne: vi.fn(async () => complete),
    }
    const slots = {
      findOneAndUpdate: vi.fn(async () => null),
      findOne: vi.fn(async () => null),
    }

    await expect(
      applyPaymentOutcome(createModels(orders, slots), 'order-001', 'success'),
    ).rejects.toBeInstanceOf(PaymentSlotNotFoundError)
  })

  it('repairs the slot link when the first slot write fails', async () => {
    let orderStatus = 'PENDING'
    const complete = {
      orderId: 'order-001',
      listingId: 'listing-001',
      slotId: 'slot-001',
      customerId: 'customer-001',
      status: 'COMPLETE',
    }
    const orders = {
      findOneAndUpdate: vi.fn(async () => {
        if (orderStatus !== 'PENDING') return null
        orderStatus = 'COMPLETE'
        return complete
      }),
      findOne: vi.fn(async () => ({ ...complete, status: orderStatus })),
    }
    const securedSlot = {
      listingId: 'listing-001',
      slotId: 'slot-001',
      state: 'secured',
      orderId: 'order-001',
      customerId: 'customer-001',
    }
    const slots = {
      findOneAndUpdate: vi
        .fn()
        .mockRejectedValueOnce(new Error('slot write failed'))
        .mockResolvedValueOnce(securedSlot),
      findOne: vi.fn(),
    }
    const session = createSession()
    session.withTransaction.mockImplementation(async (callback) => {
      const originalStatus = orderStatus
      try {
        return await callback()
      } catch (error) {
        orderStatus = originalStatus
        throw error
      }
    })
    const models = createModels(orders, slots, session)

    await expect(
      applyPaymentOutcome(models, 'order-001', 'success'),
    ).rejects.toThrow('slot write failed')
    expect(orderStatus).toBe('PENDING')
    await expect(
      applyPaymentOutcome(models, 'order-001', 'success'),
    ).resolves.toEqual(complete)
    expect(orderStatus).toBe('COMPLETE')
    expect(slots.findOneAndUpdate).toHaveBeenCalledTimes(2)
    expect(orders.findOne).not.toHaveBeenCalled()
  })

  it('does not overwrite a slot secured by another order', async () => {
    const complete = {
      orderId: 'order-001',
      listingId: 'listing-001',
      slotId: 'slot-001',
      customerId: 'customer-001',
      status: 'COMPLETE',
    }
    const orders = {
      findOneAndUpdate: vi.fn(async () => complete),
      findOne: vi.fn(async () => complete),
    }
    const slots = {
      findOneAndUpdate: vi.fn(async () => null),
      findOne: vi.fn(async () => ({
        listingId: 'listing-001',
        slotId: 'slot-001',
        state: 'secured',
        orderId: 'order-002',
        customerId: 'customer-002',
      })),
    }

    await expect(
      applyPaymentOutcome(createModels(orders, slots), 'order-001', 'success'),
    ).rejects.toBeInstanceOf(PaymentSlotConflictError)
    expect(slots.findOneAndUpdate).toHaveBeenCalledOnce()
    expect(slots.findOne).toHaveBeenLastCalledWith(
      { listingId: 'listing-001', slotId: 'slot-001' },
      null,
      { session: expect.any(Object) },
    )
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
