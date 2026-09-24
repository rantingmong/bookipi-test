import {
  addListingSlotsInputSchema,
  listingInputSchema,
} from '#features/listing/schema'
import type { ListingCreationDependencies } from '#features/listing/types'

export { listingInputSchema }

export async function createListing(
  input: unknown,
  dependencies: ListingCreationDependencies,
) {
  const parsed = listingInputSchema.parse(input)
  const { initialSlotCount, ...listing } = parsed
  const session = await dependencies.connection.startSession()
  const slots = Array.from({ length: initialSlotCount }, (_unused, index) => ({
    listingId: listing.listingId,
    slotId: `${listing.listingId}:slot:${String(index + 1).padStart(4, '0')}`,
    state: 'available' as const,
  }))

  try {
    await session.withTransaction(async () => {
      await dependencies.ListingModel.create([listing], { session })
      await dependencies.ListingSlotModel.insertMany(slots, { session })
    })
  } finally {
    await session.endSession()
  }

  return {
    ...listing,
    stockTotal: initialSlotCount,
    publicStock: initialSlotCount - listing.reserveSlots,
    slots,
  }
}

export async function getListingCounts(
  listingId: string,
  reserveSlots: number,
  dependencies: Pick<ListingCreationDependencies, 'ListingSlotModel'>,
) {
  const stockTotal = await dependencies.ListingSlotModel.countDocuments({
    listingId,
  })
  return {
    stockTotal,
    reserveSlots,
    publicStock: stockTotal - reserveSlots,
  }
}

export async function addListingSlots(
  input: unknown,
  dependencies: ListingCreationDependencies,
) {
  const request = addListingSlotsInputSchema.parse(input)
  const session = await dependencies.connection.startSession()
  let result:
    | {
        listing: Record<string, unknown>
        stockTotal: number
        reserveSlots: number
        publicStock: number
        slots: Array<{ listingId: string; slotId: string; state: 'available' }>
      }
    | undefined

  try {
    await session.withTransaction(async () => {
      const listingQuery = dependencies.ListingModel.findOne({
        listingId: request.listingId,
      })
      const listing = await listingQuery.session(session)
      if (!listing)
        throw new Error(`Listing ${request.listingId} does not exist`)

      await dependencies.ListingModel.updateOne(
        { listingId: request.listingId },
        { $set: { updatedAt: new Date() } },
        { session },
      )
      const countQuery = dependencies.ListingSlotModel.countDocuments({
        listingId: request.listingId,
      })
      const existingSlotCount = await countQuery.session(session)
      const stockTotal = existingSlotCount + request.additionalSlots
      const publicStock = stockTotal - listing.reserveSlots
      const slots = Array.from(
        { length: request.additionalSlots },
        (_unused, index) => ({
          listingId: request.listingId,
          slotId: `${request.listingId}:slot:${String(existingSlotCount + index + 1).padStart(4, '0')}`,
          state: 'available' as const,
        }),
      )

      await dependencies.ListingSlotModel.insertMany(slots, { session })
      result = {
        listing: listing.toObject(),
        stockTotal,
        reserveSlots: listing.reserveSlots,
        publicStock,
        slots,
      }
    })
  } finally {
    await session.endSession()
  }

  if (!result) throw new Error('Listing slot transaction did not complete')
  return result
}
