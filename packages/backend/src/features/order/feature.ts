import { orderInputSchema } from '#features/order/schema'
import type { OrderDocument, ReservationFacts } from '#features/order/types'
import type { Model } from 'mongoose'
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
