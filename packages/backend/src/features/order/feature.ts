import { orderInputSchema } from '#features/order/schema'
import type { OrderDocument, ReservationFacts } from '#features/order/types'
import { releaseCancelledSlot } from '#features/listing/feature'
import type { Model } from 'mongoose'
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

export async function applyReservationFacts(
  ordersModel: Pick<Model<OrderDocument>, 'findOneAndUpdate'>,
  facts: ReservationFacts,
): Promise<OrderDocument> {
  const updatedAt = new Date()
  const order = await ordersModel.findOneAndUpdate(
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
    ordersModel: Pick<Model<OrderDocument>, 'updateOne'>
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

  await dependencies.ordersModel.updateOne(
    {
      orderId: order.orderId,
      status: 'CANCELLED',
      releaseStatus: 'PENDING',
    },
    { $set: { releaseStatus: 'COMPLETE' } },
  )
}
