import { describe, expect, it, vi } from 'vitest'
import { seedListingData } from '#features/seed/feature'
import type { OrderDocument } from '#features/order/types'
import type { StorageDependencies } from '#types'
import type { Model } from 'mongoose'

describe('demo seed feature', () => {
  it('uses listing creation to store and publish ten slots', async () => {
    const session = {
      withTransaction: vi.fn(async (callback) => callback()),
      endSession: vi.fn(),
    }
    const create = vi.fn(async () => undefined)
    const insertMany = vi.fn(async (..._args: unknown[]) => undefined)
    const evalScript = vi
      .fn()
      .mockResolvedValueOnce(10)
      .mockResolvedValueOnce(1)
    const dependencies = {
      mongoConnection: { startSession: vi.fn(async () => session) },
      ListingModel: { create },
      ListingSlotModel: { insertMany },
      OrdersModel: {} as unknown as Model<OrderDocument>,
      valkeyConnection: {
        eval: evalScript,
        llen: vi.fn(async () => 10),
        hget: vi.fn(async () => '10'),
      },
    }

    const result = await seedListingData(
      dependencies as unknown as StorageDependencies,
    )

    expect(result).toMatchObject({
      stockTotal: 10,
      reserveSlots: 2,
      publicStock: 8,
    })
    expect(create).toHaveBeenCalledOnce()
    expect(insertMany.mock.calls[0]?.[0]).toHaveLength(10)
    expect(evalScript).toHaveBeenCalledTimes(2)
  })
})
