import { createListing } from '#features/listing/feature'
import type { StorageDependencies } from '#types'

const demoListing = {
  listingId: 'listing-seed-001',
  productName: 'Bookipi Pro',
  saleStartsAt: '2026-10-01T10:00:00.000Z',
  saleEndsAt: '2026-10-01T11:00:00.000Z',
  reserveSlots: 2,
  initialSlotCount: 10,
}

export async function seedListingData(dependencies: StorageDependencies) {
  return createListing(demoListing, dependencies)
}
