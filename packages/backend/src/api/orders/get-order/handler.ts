import {
  getRequestIdentity,
  getRequestModels,
} from '#api/middleware/request-context'
import { HttpError } from '#api/orders/generated/_shared/errors'
import type { Order } from '#api/orders/generated/models'
import type { OrderDocument } from '#features/order/types'
import { findOwnedOrder, OrderNotFoundError } from '#features/order/feature'

export function toOrderResponse(order: OrderDocument): Order {
  if (!order.createdAt || !order.updatedAt) {
    throw new Error('Order timestamps are missing')
  }
  return {
    orderId: order.orderId,
    customerId: order.customerId,
    listingId: order.listingId,
    slotId: order.slotId,
    status: order.status,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
  }
}

export async function getOrder(orderId: string): Promise<Order> {
  const identity = getRequestIdentity()
  try {
    const order = await findOwnedOrder(
      getRequestModels(),
      orderId,
      identity.customerId,
    )
    return toOrderResponse(order)
  } catch (error) {
    if (error instanceof OrderNotFoundError) {
      throw new HttpError(404, 'Not found')
    }
    throw error
  }
}
