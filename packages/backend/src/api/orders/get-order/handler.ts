import { HttpError } from '#api/orders/generated/_shared/errors'
import type { Order } from '#api/orders/generated/models'
import { getOrdersRequestContext } from '#api/orders/request-context'
import type { OrderDocument } from '#features/order/types'

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
  const { identity, ordersModel } = getOrdersRequestContext()
  const order = await ordersModel.findOne({
    orderId,
    customerId: identity.customerId,
  })
  if (!order) {
    throw new HttpError(404, 'Not found')
  }
  return toOrderResponse(order)
}
