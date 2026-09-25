import { HttpError } from '#api/orders/generated/_shared/errors'
import type { Order } from '#api/orders/generated/models'
import {
  getRequestIdentity,
  getRequestModels,
} from '#api/middleware/request-context'
import { toOrderResponse } from '#api/orders/get-order/handler'
import { findOwnedOrderForListing } from '#features/order/feature'

export async function getCurrentOrder(params: {
  listingId: string
}): Promise<Order> {
  const identity = getRequestIdentity()
  const order = await findOwnedOrderForListing(
    getRequestModels(),
    params.listingId,
    identity.customerId,
  )
  if (!order) throw new HttpError(404, 'Not found')
  return toOrderResponse(order)
}
