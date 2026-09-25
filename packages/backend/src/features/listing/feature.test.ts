import {
  addListingSlots,
  createListing,
  getListingCounts,
  getListingStatus,
  listingInputSchema,
  releaseCancelledSlot,
  seedListingInventory,
} from '#features/listing/feature'
import { createListingModels } from '#features/listing/models'
import type { Models, StorageDependencies } from '#types'
import { describe, expect, it, vi } from 'vitest'

function createModels(
  overrides: {
    ListingModel?: object
    ListingSlotModel?: object
    OrdersModel?: object
  } = {},
): Models {
  return {
    ListingModel: {},
    ListingSlotModel: {},
    OrdersModel: {},
    ...overrides,
  } as unknown as Models
}

const validListing = {
  listingId: 'flash-sale-2026',
  productName: 'Bookipi Pro',
  saleStartsAt: '2026-10-01T10:00:00.000Z',
  saleEndsAt: '2026-10-01T11:00:00.000Z',
  reserveSlots: 5,
  initialSlotCount: 15,
}

describe('listing feature', () => {
  it('accepts only listing IDs that are safe Valkey hash tags', async () => {
    for (const listingId of ['flash-sale-2026', 'Flash_Sale_26', 'sale9']) {
      expect(
        listingInputSchema.parse({ ...validListing, listingId }).listingId,
      ).toBe(listingId)
    }
    for (const listingId of ['sale:{other}', 'sale.one', 'a'.repeat(129)]) {
      expect(() =>
        listingInputSchema.parse({ ...validListing, listingId }),
      ).toThrow()
      await expect(
        addListingSlots(
          { listingId, additionalSlots: 1 },
          {} as unknown as StorageDependencies,
        ),
      ).rejects.toThrow()
    }
  })

  it('validates initial slot counts and reserve bounds', () => {
    expect(listingInputSchema.parse(validListing).initialSlotCount).toBe(15)
    expect(() =>
      listingInputSchema.parse({ ...validListing, initialSlotCount: 0 }),
    ).toThrow()
    expect(() =>
      listingInputSchema.parse({ ...validListing, initialSlotCount: 1.5 }),
    ).toThrow()
    expect(() =>
      listingInputSchema.parse({ ...validListing, reserveSlots: -1 }),
    ).toThrow()
    expect(() =>
      listingInputSchema.parse({ ...validListing, reserveSlots: 16 }),
    ).toThrow()
    expect(() =>
      listingInputSchema.parse({
        ...validListing,
        initialSlotCount: 4,
        reserveSlots: 5,
      }),
    ).toThrow()
    expect(() =>
      listingInputSchema.parse({ ...validListing, stockTotal: 99 }),
    ).toThrow()
    expect(() =>
      listingInputSchema.parse({ ...validListing, publicStock: 99 }),
    ).toThrow()
  })

  it('requires the sale end to follow the sale start', () => {
    expect(() =>
      listingInputSchema.parse({
        ...validListing,
        saleEndsAt: validListing.saleStartsAt,
      }),
    ).toThrow()
  })

  it('creates metadata and initial slots in one transaction', async () => {
    const steps: string[] = []
    const session = {
      withTransaction: vi.fn(async (callback) => {
        await callback()
        steps.push('commit')
      }),
      endSession: vi.fn(),
    }
    const connection = { startSession: vi.fn(async () => session) }
    const ListingModel = { create: vi.fn(async (docs) => docs) }
    const ListingSlotModel = { insertMany: vi.fn(async (docs) => docs) }
    const evalScript = vi
      .fn()
      .mockResolvedValueOnce(15)
      .mockResolvedValueOnce(1)
    const valkeyConnection = {
      eval: vi.fn(async (...args: unknown[]) => {
        if (evalScript.mock.calls.length === 0) {
          steps.push('seed')
        }
        return evalScript(...args)
      }),
      llen: vi.fn(async () => 15),
      hget: vi.fn(async () => '15'),
    }
    const result = await createListing(validListing, {
      mongoConnection: connection as never,
      ListingModel,
      ListingSlotModel,
      OrdersModel: {},
      valkeyConnection: valkeyConnection as never,
    } as unknown as StorageDependencies)

    expect(ListingModel.create).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          listingId: validListing.listingId,
          reserveSlots: 5,
        }),
      ],
      { session },
    )
    const storedListing = ListingModel.create.mock.calls[0]?.[0]?.[0]
    expect(storedListing).not.toHaveProperty('stockTotal')
    expect(storedListing).not.toHaveProperty('publicStock')
    expect(result).toMatchObject({
      stockTotal: 15,
      reserveSlots: 5,
      publicStock: 10,
    })
    const slotCalls = ListingSlotModel.insertMany.mock
      .calls as unknown as Array<
      [Array<{ listingId: string; slotId: string; state: string }>]
    >
    const slots = slotCalls[0]?.[0]
    expect(slots).toHaveLength(15)
    expect(new Set(slots?.map((slot) => slot.slotId)).size).toBe(15)
    expect(slots?.[0]).toMatchObject({
      listingId: validListing.listingId,
      slotId: `${validListing.listingId}:slot:0001`,
      state: 'available',
    })
    expect(session.withTransaction).toHaveBeenCalledOnce()
    expect(session.endSession).toHaveBeenCalledOnce()
    expect(steps).toEqual(['commit', 'seed'])
    expect(valkeyConnection.eval).toHaveBeenCalledTimes(2)
    expect(valkeyConnection.eval.mock.calls[0]?.slice(-15)).toEqual(
      slots?.map((slot) => slot.slotId),
    )
  })

  it('does not report a created listing when inventory seeding fails', async () => {
    const session = {
      withTransaction: vi.fn(async (callback) => callback()),
      endSession: vi.fn(),
    }
    await expect(
      createListing(validListing, {
        mongoConnection: { startSession: vi.fn(async () => session) } as never,
        ListingModel: { create: vi.fn(async () => undefined) },
        ListingSlotModel: { insertMany: vi.fn(async () => undefined) },
        OrdersModel: {},
        valkeyConnection: {
          eval: vi.fn(async () => {
            throw new Error('Valkey inventory seed verification failed')
          }),
        } as never,
      } as unknown as StorageDependencies),
    ).rejects.toThrow('Valkey inventory seed verification failed')
  })

  it('derives total and public counts from the slot collection', async () => {
    const countDocuments = vi.fn(async () => 15)
    const ListingSlotModel = { countDocuments }

    await expect(
      getListingCounts(
        'flash-sale-2026',
        5,
        createModels({ ListingSlotModel }),
      ),
    ).resolves.toEqual({ stockTotal: 15, reserveSlots: 5, publicStock: 10 })
    expect(countDocuments).toHaveBeenCalledWith({
      listingId: 'flash-sale-2026',
    })
  })

  it('returns public listing metadata and order-derived sale counts', async () => {
    const listing = {
      listingId: 'flash-sale-2026',
      productName: 'Bookipi Pro',
      saleStartsAt: new Date('2026-10-01T10:00:00.000Z'),
      saleEndsAt: new Date('2026-10-01T11:00:00.000Z'),
      reserveSlots: 5,
    }
    const findOne = vi.fn(async () => listing)
    const countDocuments = vi.fn(async () => 15)
    const countOrders = vi.fn(async (filter: Record<string, unknown>) => {
      if (filter.status === 'COMPLETE') return 3
      return 5
    })

    await expect(
      getListingStatus(
        'flash-sale-2026',
        createModels({
          ListingModel: { findOne },
          ListingSlotModel: { countDocuments },
          OrdersModel: { countDocuments: countOrders },
        }),
      ),
    ).resolves.toEqual({
      listingId: 'flash-sale-2026',
      productName: 'Bookipi Pro',
      saleStartsAt: '2026-10-01T10:00:00.000Z',
      saleEndsAt: '2026-10-01T11:00:00.000Z',
      stockTotal: 15,
      reserveSlots: 5,
      publicStock: 10,
      boughtUnits: 3,
      remainingUnits: 5,
    })
    expect(findOne).toHaveBeenCalledWith({ listingId: 'flash-sale-2026' })
    expect(countDocuments).toHaveBeenCalledWith({
      listingId: 'flash-sale-2026',
    })
    expect(countOrders).toHaveBeenCalledWith({
      listingId: 'flash-sale-2026',
      status: 'COMPLETE',
    })
    expect(countOrders).toHaveBeenCalledWith({
      listingId: 'flash-sale-2026',
      status: { $in: ['PENDING', 'COMPLETE'] },
    })
  })

  it('does not count cancelled orders against remaining units', async () => {
    const countDocuments = vi.fn(async () => 8)
    const countOrders = vi.fn(async (filter: Record<string, unknown>) => {
      if (filter.status === 'COMPLETE') return 2
      return 4
    })
    const status = await getListingStatus(
      'flash-sale-2026',
      createModels({
        ListingModel: {
          findOne: vi.fn(async () => ({
            listingId: 'flash-sale-2026',
            productName: 'Bookipi Pro',
            saleStartsAt: new Date('2026-10-01T10:00:00.000Z'),
            saleEndsAt: new Date('2026-10-01T11:00:00.000Z'),
            reserveSlots: 2,
          })),
        },
        ListingSlotModel: { countDocuments },
        OrdersModel: { countDocuments: countOrders },
      }),
    )

    expect(status?.remainingUnits).toBe(2)
    expect(status?.boughtUnits).toBe(2)
  })

  it('clamps remaining units at zero', async () => {
    const status = await getListingStatus(
      'flash-sale-2026',
      createModels({
        ListingModel: {
          findOne: vi.fn(async () => ({
            listingId: 'flash-sale-2026',
            productName: 'Bookipi Pro',
            saleStartsAt: new Date('2026-10-01T10:00:00.000Z'),
            saleEndsAt: new Date('2026-10-01T11:00:00.000Z'),
            reserveSlots: 2,
          })),
        },
        ListingSlotModel: { countDocuments: vi.fn(async () => 5) },
        OrdersModel: {
          countDocuments: vi.fn(async (filter: Record<string, unknown>) => {
            if (filter.status === 'COMPLETE') return 4
            return 6
          }),
        },
      }),
    )

    expect(status?.remainingUnits).toBe(0)
    expect(status?.boughtUnits).toBe(4)
  })

  it('returns no public status for an unknown listing', async () => {
    await expect(
      getListingStatus(
        'missing',
        createModels({
          ListingModel: { findOne: vi.fn(async () => null) },
          ListingSlotModel: { countDocuments: vi.fn() },
        }),
      ),
    ).resolves.toBeNull()
  })

  it('adds only the next sequential slots inside a transaction', async () => {
    const session = {
      withTransaction: vi.fn(async (callback) => callback()),
      endSession: vi.fn(),
    }
    const listing = {
      listingId: 'flash-sale-2026',
      reserveSlots: 2,
      toObject: () => ({ listingId: 'flash-sale-2026', reserveSlots: 2 }),
    }
    const listingQuery = { session: vi.fn(async () => listing) }
    const countQuery = { session: vi.fn(async () => 10) }
    const connection = { startSession: vi.fn(async () => session) }
    const ListingModel = {
      findOne: vi.fn(() => listingQuery),
      updateOne: vi.fn(async () => ({ acknowledged: true })),
    }
    const ListingSlotModel = {
      countDocuments: vi.fn(() => countQuery),
      insertMany: vi.fn(async (slots) => slots),
    }

    const result = await addListingSlots(
      { listingId: 'flash-sale-2026', additionalSlots: 3 },
      {
        mongoConnection: connection as never,
        valkeyConnection: {} as never,
        ListingModel,
        ListingSlotModel,
        OrdersModel: {},
      } as unknown as StorageDependencies,
    )

    expect(result).toMatchObject({
      stockTotal: 13,
      reserveSlots: 2,
      publicStock: 11,
    })
    expect(result.slots.map((slot) => slot.slotId)).toEqual([
      'flash-sale-2026:slot:0011',
      'flash-sale-2026:slot:0012',
      'flash-sale-2026:slot:0013',
    ])
    expect(ListingModel.updateOne).toHaveBeenCalledWith(
      { listingId: 'flash-sale-2026' },
      { $set: { updatedAt: expect.any(Date) } },
      { session },
    )
    expect(ListingSlotModel.insertMany).toHaveBeenCalledWith(result.slots, {
      session,
    })
    expect(session.withTransaction).toHaveBeenCalledOnce()
  })

  it('rejects invalid slot additions before opening a transaction', async () => {
    const startSession = vi.fn()
    const dependencies = {
      mongoConnection: { startSession },
      valkeyConnection: {} as never,
      ListingModel: {},
      ListingSlotModel: {},
      OrdersModel: {},
    } as unknown as StorageDependencies

    await expect(
      addListingSlots(
        { listingId: 'flash-sale-2026', additionalSlots: 0 },
        dependencies,
      ),
    ).rejects.toThrow()
    await expect(
      addListingSlots(
        { listingId: 'flash-sale-2026', additionalSlots: 1.5 },
        dependencies,
      ),
    ).rejects.toThrow()
    expect(startSession).not.toHaveBeenCalled()
  })

  it('uses required collection names and slot indexes', () => {
    const connection = {
      models: {},
      model: vi.fn((_name, _schema, collection) => ({
        collection: { name: collection },
      })),
    }

    createListingModels(connection as never)

    expect(connection.model).toHaveBeenCalledWith(
      'Listing',
      expect.anything(),
      'listings',
    )
    expect(connection.model).toHaveBeenCalledWith(
      'ListingSlot',
      expect.anything(),
      'listing-slots',
    )
    const listingSchema = connection.model.mock.calls[0]?.[1]
    expect(listingSchema.obj).not.toHaveProperty('stockTotal')
    expect(listingSchema.obj).not.toHaveProperty('publicStock')
    expect(listingSchema.indexes()).toContainEqual([
      { listingId: 1 },
      { unique: true },
    ])
    const slotSchema = connection.model.mock.calls[1]?.[1]
    expect(slotSchema.indexes()).toContainEqual([
      { listingId: 1, slotId: 1 },
      { unique: true },
    ])
    expect(slotSchema.indexes()).toContainEqual([
      { listingId: 1, state: 1 },
      {},
    ])
  })

  it('publishes only after the Valkey seed count matches', async () => {
    const evalScript = vi.fn().mockResolvedValueOnce(2).mockResolvedValueOnce(1)
    const client = {
      eval: evalScript,
      llen: vi.fn(async () => 2),
      hget: vi.fn(async () => '2'),
    }
    await seedListingInventory(client as never, {
      listing: {
        listingId: 'sale-1',
        saleStartsAt: new Date('2026-10-01T10:00:00.000Z'),
        saleEndsAt: new Date('2026-10-01T11:00:00.000Z'),
        reserveSlots: 1,
      },
      slots: [{ slotId: 'slot-1' }, { slotId: 'slot-2' }],
    })
    expect(evalScript).toHaveBeenCalledTimes(2)
    expect(evalScript.mock.calls[0]?.slice(4, 6)).toEqual([
      String(new Date('2026-10-01T10:00:00.000Z').getTime()),
      String(new Date('2026-10-01T11:00:00.000Z').getTime()),
    ])
  })

  it('keeps the listing unpublished when the Valkey count differs', async () => {
    const evalScript = vi.fn(async () => 2)
    await expect(
      seedListingInventory(
        {
          eval: evalScript,
          llen: vi.fn(async () => 1),
          hget: vi.fn(async () => '2'),
        } as never,
        {
          listing: {
            listingId: 'sale-1',
            saleStartsAt: new Date('2026-10-01T10:00:00.000Z'),
            saleEndsAt: new Date('2026-10-01T11:00:00.000Z'),
            reserveSlots: 1,
          },
          slots: [{ slotId: 'slot-1' }, { slotId: 'slot-2' }],
        },
      ),
    ).rejects.toThrow('seed verification failed')
    expect(evalScript).toHaveBeenCalledOnce()
  })

  it('releases a cancelled slot through one guarded operation', async () => {
    const evalScript = vi.fn(async (..._args: unknown[]) => 1)
    await expect(
      releaseCancelledSlot({ eval: evalScript } as never, {
        listingId: 'sale-1',
        customerId: 'customer-1',
        orderId: 'order-1',
        slotId: 'slot-1',
        orderStatus: 'CANCELLED',
      }),
    ).resolves.toBe(true)
    const script = evalScript.mock.calls[0]?.[0]
    expect(script).toContain("local orderPrefix = orderId .. ':'")
    expect(script).toContain(
      "redis.call('HGET', KEYS[3], orderPrefix .. 'orderId')",
    )
    expect(script).toContain(
      "redis.call('HGET', KEYS[3], orderPrefix .. 'customerId')",
    )
    expect(script).toContain("redis.call('HGET', KEYS[5], activeCustomerField)")
    expect(script).toContain("redis.call('EXISTS', KEYS[4])")
    expect(script).toContain("redis.call('HGET', KEYS[4], 'orderId')")
    expect(script).toContain("redis.call('HGET', KEYS[4], 'slotId')")
    expect(script).toContain("redis.call('HDEL', KEYS[5], activeCustomerField)")
    expect(script).toContain("redis.call('RPUSH', KEYS[2], slotId)")
    expect(evalScript.mock.calls[0]?.[1]).toBe(5)
    expect(evalScript.mock.calls[0]?.slice(2, 7)).toEqual([
      'sale:{sale-1}:meta',
      'sale:{sale-1}:available-slots',
      'sale:{sale-1}:orders',
      'sale:{sale-1}:order:order-1:release',
      'sale:{sale-1}:active-customers',
    ])
    expect(evalScript.mock.calls[0]?.slice(7)).toEqual([
      'order-1',
      'sale-1',
      'customer-1',
      'customer-1',
      'slot-1',
      'CANCELLED',
    ])
  })

  it('accepts a matching release marker as an idempotent success', async () => {
    const evalScript = vi.fn(async (..._args: unknown[]) => 1)

    await expect(
      releaseCancelledSlot({ eval: evalScript } as never, {
        listingId: 'sale-1',
        customerId: 'customer-1',
        orderId: 'order-1',
        slotId: 'slot-1',
        orderStatus: 'CANCELLED',
      }),
    ).resolves.toBe(true)

    expect(String(evalScript.mock.calls[0]?.[0])).toContain(
      "redis.call('HGET', KEYS[4], 'orderId') == orderId",
    )
    expect(String(evalScript.mock.calls[0]?.[0])).toContain(
      "redis.call('HGET', KEYS[4], 'slotId') == slotId",
    )
  })

  it('uses the encoded active-customer field and raw customer identity', async () => {
    const evalScript = vi.fn(async (..._args: unknown[]) => 1)

    await expect(
      releaseCancelledSlot({ eval: evalScript } as never, {
        listingId: 'sale-1',
        customerId: 'customer:a',
        orderId: 'order-1',
        slotId: 'sale-1:slot:0001',
        orderStatus: 'CANCELLED',
      }),
    ).resolves.toBe(true)

    const call = evalScript.mock.calls[0]
    const script = String(call?.[0])
    expect(call?.[1]).toBe(5)
    expect(call?.slice(7)).toEqual([
      'order-1',
      'sale-1',
      'customer:a',
      'customer%3Aa',
      'sale-1:slot:0001',
      'CANCELLED',
    ])
    expect(script).toContain('local rawCustomerId = ARGV[3]')
    expect(script).toContain("orderPrefix .. 'customerId') ~= rawCustomerId")
    expect(script).toContain('local activeCustomerField = ARGV[4]')
    expect(script).toContain("redis.call('HGET', KEYS[5], activeCustomerField)")
    expect(script).toContain("redis.call('HDEL', KEYS[5], activeCustomerField)")
  })
})
