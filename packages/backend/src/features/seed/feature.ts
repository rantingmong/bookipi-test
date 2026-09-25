import { createListing, listingInputSchema } from '#features/listing/feature'
import type { StorageDependencies } from '#types'

const demoListing = {
  listingId: 'listing-seed-001',
  productName: 'Bookipi Pro',
  saleStartsAt: '2026-10-01T10:00:00.000Z',
  saleEndsAt: '2026-10-01T11:00:00.000Z',
  reserveSlots: 2,
  initialSlotCount: 10,
}

export type ListingSeedOverrides = {
  listingId?: string
  saleStartsAt?: string
  saleEndsAt?: string
  initialSlotCount?: number
  reserveSlots?: number
}

export async function seedListingData(
  dependencies: StorageDependencies,
  overrides: ListingSeedOverrides = {},
) {
  const listing = { ...demoListing }
  if (overrides.listingId) listing.listingId = overrides.listingId
  if (overrides.saleStartsAt) listing.saleStartsAt = overrides.saleStartsAt
  if (overrides.saleEndsAt) listing.saleEndsAt = overrides.saleEndsAt
  if (overrides.initialSlotCount !== undefined)
    listing.initialSlotCount = overrides.initialSlotCount
  if (overrides.reserveSlots !== undefined)
    listing.reserveSlots = overrides.reserveSlots
  const parsedListing = listingInputSchema.parse(listing)
  const existing = await dependencies.ListingModel.findOne({
    listingId: parsedListing.listingId,
  })

  if (!existing) return createListing(parsedListing, dependencies)

  const { initialSlotCount, ...expectedListing } = parsedListing
  const expectedSlots = Array.from(
    { length: initialSlotCount },
    (_unused, index) => ({
      listingId: expectedListing.listingId,
      slotId: `${expectedListing.listingId}:slot:${String(index + 1).padStart(4, '0')}`,
      state: 'available' as const,
    }),
  )
  const existingSlots = await dependencies.ListingSlotModel.find({
    listingId: expectedListing.listingId,
  })
  const listingMatches =
    existing.listingId === expectedListing.listingId &&
    existing.productName === expectedListing.productName &&
    existing.saleStartsAt.getTime() ===
      expectedListing.saleStartsAt.getTime() &&
    existing.saleEndsAt.getTime() === expectedListing.saleEndsAt.getTime() &&
    existing.reserveSlots === expectedListing.reserveSlots
  if (!listingMatches)
    throw new Error('Existing listing facts conflict with seed')

  const slotsMatch =
    existingSlots.length === expectedSlots.length &&
    expectedSlots.every((expectedSlot) =>
      existingSlots.some(
        (slot) =>
          slot.listingId === expectedSlot.listingId &&
          slot.slotId === expectedSlot.slotId &&
          slot.state === expectedSlot.state &&
          !slot.orderId &&
          !slot.customerId,
      ),
    )
  const metaKey = `sale:{${expectedListing.listingId}}:meta`
  const slotsKey = `sale:{${expectedListing.listingId}}:available-slots`
  const [
    saleStartsAt,
    saleEndsAt,
    reserveSlots,
    seedVersion,
    seedCount,
    published,
    availableSlots,
  ] = await Promise.all([
    dependencies.valkeyConnection.hget(metaKey, 'saleStartsAt'),
    dependencies.valkeyConnection.hget(metaKey, 'saleEndsAt'),
    dependencies.valkeyConnection.hget(metaKey, 'reserveSlots'),
    dependencies.valkeyConnection.hget(metaKey, 'seedVersion'),
    dependencies.valkeyConnection.hget(metaKey, 'seedCount'),
    dependencies.valkeyConnection.hget(metaKey, 'published'),
    dependencies.valkeyConnection.lrange(slotsKey, 0, -1),
  ])
  const inventoryMatches =
    saleStartsAt === String(expectedListing.saleStartsAt.getTime()) &&
    saleEndsAt === String(expectedListing.saleEndsAt.getTime()) &&
    reserveSlots === String(expectedListing.reserveSlots) &&
    seedVersion === '1' &&
    seedCount === String(initialSlotCount) &&
    published === '1' &&
    availableSlots.length === expectedSlots.length &&
    expectedSlots.every((slot, index) => availableSlots[index] === slot.slotId)

  if (!slotsMatch || !inventoryMatches)
    throw new Error('Existing listing facts conflict with seed')

  return {
    ...expectedListing,
    stockTotal: initialSlotCount,
    publicStock: initialSlotCount - expectedListing.reserveSlots,
    slots: expectedSlots,
  }
}
