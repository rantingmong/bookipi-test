import { HttpError } from '#api/listings/generated/_shared/errors'
import type { ListingStatus } from '#api/listings/generated/models'
import { getRequestModels } from '#api/middleware/request-context'
import { getListingStatus as readListingStatus } from '#features/listing/feature'

export async function getListingStatus(
  listingId: string,
): Promise<ListingStatus> {
  const status = await readListingStatus(listingId, getRequestModels())
  if (!status) throw new HttpError(404, 'Not found')
  return status
}
