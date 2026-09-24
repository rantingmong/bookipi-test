import { describe, expect, it, vi } from 'vitest'
import {
  addListingSlots,
  createListing,
  getListingCounts,
  listingInputSchema,
} from '#features/listing/feature'
import { createListingModels } from '#features/listing/models'

const validListing = {
  listingId: 'flash-sale-2026',
  productName: 'Bookipi Pro',
  saleStartsAt: '2026-10-01T10:00:00.000Z',
  saleEndsAt: '2026-10-01T11:00:00.000Z',
  reserveSlots: 5,
  initialSlotCount: 15,
}

describe('listing feature', () => {
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
    const session = {
      withTransaction: vi.fn(async (callback) => callback()),
      endSession: vi.fn(),
    }
    const connection = { startSession: vi.fn(async () => session) }
    const ListingModel = { create: vi.fn(async (docs) => docs) }
    const ListingSlotModel = { insertMany: vi.fn(async (docs) => docs) }

    const result = await createListing(validListing, {
      connection: connection as never,
      ListingModel: ListingModel as never,
      ListingSlotModel: ListingSlotModel as never,
    })

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
  })

  it('derives total and public counts from the slot collection', async () => {
    const countDocuments = vi.fn(async () => 15)
    const ListingSlotModel = { countDocuments }

    await expect(
      getListingCounts('flash-sale-2026', 5, {
        ListingSlotModel: ListingSlotModel as never,
      }),
    ).resolves.toEqual({ stockTotal: 15, reserveSlots: 5, publicStock: 10 })
    expect(countDocuments).toHaveBeenCalledWith({
      listingId: 'flash-sale-2026',
    })
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
        connection: connection as never,
        ListingModel: ListingModel as never,
        ListingSlotModel: ListingSlotModel as never,
      },
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
      connection: { startSession },
      ListingModel: {} as never,
      ListingSlotModel: {} as never,
    }

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
})
