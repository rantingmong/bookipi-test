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
    const create = vi.fn(async (_documents: unknown[]) => undefined)
    const insertMany = vi.fn(async (..._args: unknown[]) => undefined)
    const evalScript = vi
      .fn()
      .mockResolvedValueOnce(10)
      .mockResolvedValueOnce(1)
    const dependencies = {
      mongoConnection: { startSession: vi.fn(async () => session) },
      ListingModel: {
        create,
        findOne: vi.fn(async () => null),
      },
      ListingSlotModel: { insertMany, find: vi.fn(async () => []) },
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

  it('uses the supplied sale window for a time-independent integration listing', async () => {
    const session = {
      withTransaction: vi.fn(async (callback) => callback()),
      endSession: vi.fn(),
    }
    const create = vi.fn(async (_documents: unknown[]) => undefined)
    const insertMany = vi.fn(async (..._args: unknown[]) => undefined)
    const evalScript = vi
      .fn()
      .mockResolvedValueOnce(10)
      .mockResolvedValueOnce(1)
    const dependencies = {
      mongoConnection: { startSession: vi.fn(async () => session) },
      ListingModel: {
        create,
        findOne: vi.fn(async () => null),
      },
      ListingSlotModel: { insertMany, find: vi.fn(async () => []) },
      OrdersModel: {} as unknown as Model<OrderDocument>,
      valkeyConnection: {
        eval: evalScript,
        llen: vi.fn(async () => 10),
        hget: vi.fn(async () => '10'),
      },
    }

    await seedListingData(dependencies as unknown as StorageDependencies, {
      listingId: 'integration-sale',
      saleStartsAt: '2026-09-25T00:00:00.000Z',
      saleEndsAt: '2026-09-26T00:00:00.000Z',
    })

    const createdDocuments = create.mock.calls[0]?.[0] as
      Array<Record<string, unknown>> | undefined
    expect(createdDocuments?.[0]).toMatchObject({
      listingId: 'integration-sale',
      saleStartsAt: new Date('2026-09-25T00:00:00.000Z'),
      saleEndsAt: new Date('2026-09-26T00:00:00.000Z'),
    })
  })

  it('seeds the requested number of claimable slots with no reserve', async () => {
    const session = {
      withTransaction: vi.fn(async (callback) => callback()),
      endSession: vi.fn(),
    }
    const create = vi.fn(async (_documents: unknown[]) => undefined)
    const insertMany = vi.fn(async (..._args: unknown[]) => undefined)
    const evalScript = vi.fn().mockResolvedValueOnce(3).mockResolvedValueOnce(1)
    const dependencies = {
      mongoConnection: { startSession: vi.fn(async () => session) },
      ListingModel: { create, findOne: vi.fn(async () => null) },
      ListingSlotModel: { insertMany, find: vi.fn(async () => []) },
      OrdersModel: {} as unknown as Model<OrderDocument>,
      valkeyConnection: {
        eval: evalScript,
        llen: vi.fn(async () => 3),
        hget: vi.fn(async () => '3'),
      },
    }

    const result = await seedListingData(
      dependencies as unknown as StorageDependencies,
      { initialSlotCount: 3, reserveSlots: 0 },
    )

    expect(result.stockTotal).toBe(3)
    expect(result.reserveSlots).toBe(0)
    expect(result.publicStock).toBe(3)
    expect(insertMany.mock.calls[0]?.[0]).toHaveLength(3)
  })

  it('accepts an identical existing listing without publishing inventory again', async () => {
    const listing = {
      listingId: 'integration-sale',
      productName: 'Bookipi Pro',
      saleStartsAt: new Date('2026-09-25T00:00:00.000Z'),
      saleEndsAt: new Date('2026-09-26T00:00:00.000Z'),
      reserveSlots: 2,
    }
    const slots = Array.from({ length: 10 }, (_unused, index) => ({
      listingId: listing.listingId,
      slotId: `${listing.listingId}:slot:${String(index + 1).padStart(4, '0')}`,
      state: 'available',
    }))
    const create = vi.fn()
    const insertMany = vi.fn()
    const evalScript = vi.fn()
    const findOne = vi.fn(async () => listing)
    const dependencies = {
      mongoConnection: { startSession: vi.fn() },
      ListingModel: { create, findOne },
      ListingSlotModel: { insertMany, find: vi.fn(async () => slots) },
      OrdersModel: {} as unknown as Model<OrderDocument>,
      valkeyConnection: {
        eval: evalScript,
        llen: vi.fn(async () => 10),
        lrange: vi.fn(async () => slots.map((slot) => slot.slotId)),
        hget: vi.fn(async (_key: string, field: string) => {
          const facts: Record<string, string> = {
            saleStartsAt: String(listing.saleStartsAt.getTime()),
            saleEndsAt: String(listing.saleEndsAt.getTime()),
            reserveSlots: '2',
            seedVersion: '1',
            seedCount: '10',
            published: '1',
          }
          return facts[field] ?? null
        }),
      },
    }

    const result = await seedListingData(
      dependencies as unknown as StorageDependencies,
      {
        listingId: listing.listingId,
        saleStartsAt: listing.saleStartsAt.toISOString(),
        saleEndsAt: listing.saleEndsAt.toISOString(),
      },
    )

    expect(result.stockTotal).toBe(10)
    expect(result.slots).toEqual(slots)
    expect(findOne).toHaveBeenCalledOnce()
    expect(create).not.toHaveBeenCalled()
    expect(insertMany).not.toHaveBeenCalled()
    expect(evalScript).not.toHaveBeenCalled()
  })

  it('fails closed when existing listing facts conflict with the seed', async () => {
    const findOne = vi.fn(async () => ({
      listingId: 'integration-sale',
      productName: 'Different product',
      saleStartsAt: new Date('2026-09-25T00:00:00.000Z'),
      saleEndsAt: new Date('2026-09-26T00:00:00.000Z'),
      reserveSlots: 2,
    }))
    const dependencies = {
      mongoConnection: { startSession: vi.fn() },
      ListingModel: { create: vi.fn(), findOne },
      ListingSlotModel: { insertMany: vi.fn(), find: vi.fn() },
      OrdersModel: {} as unknown as Model<OrderDocument>,
      valkeyConnection: { eval: vi.fn() },
    }

    await expect(
      seedListingData(dependencies as unknown as StorageDependencies, {
        listingId: 'integration-sale',
        saleStartsAt: '2026-09-25T00:00:00.000Z',
        saleEndsAt: '2026-09-26T00:00:00.000Z',
      }),
    ).rejects.toThrow('Existing listing facts conflict with seed')
  })
})
