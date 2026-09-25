import type { OrderDocument } from '#features/order/types'
import { paymentOutcomeSchema } from '#features/payment/schema'
import type { PaymentOutcome } from '#features/payment/types'
import type { Models } from '#types'
import type { ClientSession } from 'mongoose'

export { paymentOutcomeSchema }

export class PaymentOutcomeConflictError extends Error {
  constructor(orderId: string) {
    super(`Conflicting payment outcome for order ${orderId}`)
    this.name = 'PaymentOutcomeConflictError'
  }
}

export class PaymentSlotNotFoundError extends Error {
  constructor(order: OrderDocument) {
    super(
      `Listing slot ${order.listingId}/${order.slotId} was not found for completed order ${order.orderId}`,
    )
    this.name = 'PaymentSlotNotFoundError'
  }
}

export class PaymentSlotConflictError extends Error {
  constructor(order: OrderDocument) {
    super(
      `Listing slot ${order.listingId}/${order.slotId} belongs to another order`,
    )
    this.name = 'PaymentSlotConflictError'
  }
}

async function secureCompletedOrderSlot(
  models: Models,
  order: OrderDocument,
  session: ClientSession,
) {
  const securedSlot = await models.ListingSlotModel.findOneAndUpdate(
    {
      listingId: order.listingId,
      slotId: order.slotId,
      state: 'available',
      orderId: { $exists: false },
      customerId: { $exists: false },
    },
    {
      $set: {
        state: 'secured',
        orderId: order.orderId,
        customerId: order.customerId,
      },
    },
    { returnDocument: 'after', session },
  )
  if (securedSlot) return

  const matchingSlot = await models.ListingSlotModel.findOne(
    {
      listingId: order.listingId,
      slotId: order.slotId,
      state: 'secured',
      orderId: order.orderId,
      customerId: order.customerId,
    },
    null,
    { session },
  )
  if (
    matchingSlot?.state === 'secured' &&
    matchingSlot.orderId === order.orderId &&
    matchingSlot.customerId === order.customerId
  )
    return

  const existingSlot = await models.ListingSlotModel.findOne(
    { listingId: order.listingId, slotId: order.slotId },
    null,
    { session },
  )
  if (!existingSlot) throw new PaymentSlotNotFoundError(order)
  throw new PaymentSlotConflictError(order)
}

async function applySuccessfulPaymentOutcome(
  models: Models,
  orderId: string,
): Promise<OrderDocument | null> {
  const session = await models.OrdersModel.db.startSession()
  let result: OrderDocument | null = null

  try {
    await session.withTransaction(async () => {
      const updated = await models.OrdersModel.findOneAndUpdate(
        { orderId, status: 'PENDING' },
        { $set: { status: 'COMPLETE' } },
        { returnDocument: 'after', session },
      )
      if (updated) {
        await secureCompletedOrderSlot(models, updated, session)
        result = updated
        return
      }

      const existing = await models.OrdersModel.findOne({ orderId }, null, {
        session,
      })
      if (!existing) return
      if (existing.status !== 'COMPLETE')
        throw new PaymentOutcomeConflictError(orderId)

      await secureCompletedOrderSlot(models, existing, session)
      result = existing
    })
  } finally {
    await session.endSession()
  }

  return result
}

export async function applyPaymentOutcome(
  models: Models,
  orderId: string,
  outcome: PaymentOutcome,
): Promise<OrderDocument | null> {
  if (outcome === 'success')
    return applySuccessfulPaymentOutcome(models, orderId)

  const status: OrderDocument['status'] = 'CANCELLED'
  const updated = await models.OrdersModel.findOneAndUpdate(
    { orderId, status: 'PENDING' },
    { $set: { status, releaseStatus: 'PENDING' } },
    { returnDocument: 'after' },
  )
  if (updated) return updated

  const existing = await models.OrdersModel.findOne({ orderId })
  if (!existing) {
    return null
  }
  if (existing.status === status) {
    return existing
  }
  throw new PaymentOutcomeConflictError(orderId)
}
