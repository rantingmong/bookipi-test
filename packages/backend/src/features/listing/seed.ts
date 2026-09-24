import { listingInputSchema } from '#features/listing/schema'
import type { ListingCreationDependencies } from '#features/listing/types'

const seedListing = listingInputSchema.parse({
  listingId: 'listing-seed-001',
  productName: 'Bookipi Pro',
  saleStartsAt: '2026-10-01T10:00:00.000Z',
  saleEndsAt: '2026-10-01T11:00:00.000Z',
  reserveSlots: 2,
  initialSlotCount: 10,
})

export async function seedListingData(
  dependencies: ListingCreationDependencies,
) {
  const session = await dependencies.connection.startSession()
  const { initialSlotCount, ...listing } = seedListing
  const slotWrites = Array.from(
    { length: initialSlotCount },
    (_unused, index) => {
      const slotId = `${seedListing.listingId}:slot:${String(index + 1).padStart(4, '0')}`
      return {
        updateOne: {
          filter: { listingId: seedListing.listingId, slotId },
          update: { $setOnInsert: seedListingSlot(slotId) },
          upsert: true,
        },
      }
    },
  )

  try {
    await session.withTransaction(async () => {
      await dependencies.ListingModel.updateOne(
        { listingId: listing.listingId },
        { $setOnInsert: listing },
        { upsert: true, session },
      )
      await dependencies.ListingSlotModel.bulkWrite(slotWrites, { session })
    })
  } finally {
    await session.endSession()
  }

  return {
    listing,
    stockTotal: initialSlotCount,
    reserveSlots: listing.reserveSlots,
    publicStock: initialSlotCount - listing.reserveSlots,
    slots: slotWrites,
  }
}

function seedListingSlot(slotId: string) {
  return {
    listingId: seedListing.listingId,
    slotId,
    state: 'available' as const,
  }
}
