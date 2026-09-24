import { describe, expect, it, vi } from 'vitest'
import { seedListingData } from '#features/listing/seed'

describe('listing seed feature', () => {
  it('writes one deterministic listing and ten available slots with repeat-safe upserts', async () => {
    const session = {
      withTransaction: vi.fn(async (callback) => callback()),
      endSession: vi.fn(),
    }
    const connection = { startSession: vi.fn(async () => session) }
    const ListingModel = {
      updateOne: vi.fn(async () => ({ acknowledged: true })),
    }
    const ListingSlotModel = {
      bulkWrite: vi.fn(async () => ({ acknowledged: true })),
    }
    const dependencies = { connection, ListingModel, ListingSlotModel }

    const firstSeed = await seedListingData(dependencies as never)
    await seedListingData(dependencies as never)

    expect(firstSeed).toMatchObject({
      stockTotal: 10,
      reserveSlots: 2,
      publicStock: 8,
    })
    expect(session.withTransaction).toHaveBeenCalledTimes(2)
    expect(ListingModel.updateOne).toHaveBeenCalledTimes(2)
    expect(ListingSlotModel.bulkWrite).toHaveBeenCalledTimes(2)
    const listingUpdateCalls = ListingModel.updateOne.mock
      .calls as unknown as Array<[unknown, Record<string, unknown>, unknown]>
    expect(listingUpdateCalls[0]).toEqual(listingUpdateCalls[1])
    expect(listingUpdateCalls[0]?.[1]).toMatchObject({
      $setOnInsert: { reserveSlots: 2 },
    })
    expect(listingUpdateCalls[0]?.[1]).not.toHaveProperty(
      '$setOnInsert.stockTotal',
    )

    const slotWriteCalls = ListingSlotModel.bulkWrite.mock
      .calls as unknown as Array<
      [
        Array<{
          updateOne: {
            filter: { listingId: string; slotId: string }
            update: { $setOnInsert: Record<string, unknown> }
            upsert: boolean
          }
        }>,
      ]
    >
    const slotWrites = slotWriteCalls[0]?.[0]
    expect(slotWrites).toHaveLength(10)
    expect(slotWrites?.map((write) => write.updateOne.filter.slotId)).toEqual(
      Array.from(
        { length: 10 },
        (_unused, index) =>
          `listing-seed-001:slot:${String(index + 1).padStart(4, '0')}`,
      ),
    )
    expect(slotWrites?.[0]).toMatchObject({
      updateOne: {
        filter: {
          listingId: 'listing-seed-001',
          slotId: 'listing-seed-001:slot:0001',
        },
        update: {
          $setOnInsert: {
            listingId: 'listing-seed-001',
            slotId: 'listing-seed-001:slot:0001',
            state: 'available',
          },
        },
        upsert: true,
      },
    })
    expect(session.endSession).toHaveBeenCalledTimes(2)
  })
})
