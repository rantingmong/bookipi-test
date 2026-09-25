import { releaseCancelledSlot } from '#features/listing/feature'
import { orderInputSchema } from '#features/order/schema'
import type { OrderDocument, ReservationFacts } from '#features/order/types'
import type { Models } from '#types'
import type { Redis } from 'ioredis'
export { orderStatuses } from '#features/order/constants'
export { orderInputSchema }

export function parseOrder(input: unknown) {
  return orderInputSchema.parse(input)
}

export class ReservationFactsConflictError extends Error {
  constructor(orderId: string) {
    super(`Conflicting reservation facts for order ${orderId}`)
    this.name = 'ReservationFactsConflictError'
  }
}

export class OrderNotFoundError extends Error {
  constructor(orderId: string) {
    super(`Order ${orderId} was not found for this customer`)
    this.name = 'OrderNotFoundError'
  }
}

export async function findOwnedOrder(
  models: Models,
  orderId: string,
  customerId: string,
): Promise<OrderDocument> {
  const order = await models.OrdersModel.findOne({ orderId, customerId })
  if (!order) throw new OrderNotFoundError(orderId)
  return order
}

export async function findOwnedOrderForListing(
  models: Models,
  listingId: string,
  customerId: string,
): Promise<OrderDocument | null> {
  return models.OrdersModel.findOne({
    listingId,
    customerId,
    status: { $in: ['PENDING', 'COMPLETE'] },
  })
}

export async function applyReservationFacts(
  models: Models,
  facts: ReservationFacts,
): Promise<OrderDocument> {
  const updatedAt = new Date()
  const order = await models.OrdersModel.findOneAndUpdate(
    { orderId: facts.orderId },
    { $setOnInsert: { ...facts, status: 'PENDING', updatedAt } },
    {
      upsert: true,
      returnDocument: 'after',
      timestamps: { updatedAt: false },
    },
  )

  if (!order) {
    throw new Error('Order upsert returned no order')
  }

  const matchesFacts =
    order.orderId === facts.orderId &&
    order.customerId === facts.customerId &&
    order.listingId === facts.listingId &&
    order.slotId === facts.slotId

  if (!matchesFacts) {
    throw new ReservationFactsConflictError(facts.orderId)
  }

  return order
}

export async function reconcileCancelledOrderRelease(
  order: OrderDocument,
  dependencies: {
    models: Models
    valkey: Redis
  },
): Promise<void> {
  if (order.status !== 'CANCELLED' || order.releaseStatus !== 'PENDING') return

  const released = await releaseCancelledSlot(dependencies.valkey, {
    orderId: order.orderId,
    customerId: order.customerId,
    listingId: order.listingId,
    slotId: order.slotId,
    orderStatus: 'CANCELLED',
  })
  if (!released)
    throw new Error(`Guarded slot release failed for order ${order.orderId}`)

  await dependencies.models.OrdersModel.updateOne(
    {
      orderId: order.orderId,
      status: 'CANCELLED',
      releaseStatus: 'PENDING',
    },
    { $set: { releaseStatus: 'COMPLETE' } },
  )
}
