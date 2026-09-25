import type { OrderDocument } from '#features/order/types'
import { paymentOutcomeSchema } from '#features/payment/schema'
import type { PaymentOutcome } from '#features/payment/types'
import type { Models } from '#types'

export { paymentOutcomeSchema }

export class PaymentOutcomeConflictError extends Error {
  constructor(orderId: string) {
    super(`Conflicting payment outcome for order ${orderId}`)
    this.name = 'PaymentOutcomeConflictError'
  }
}

export async function applyPaymentOutcome(
  models: Models,
  orderId: string,
  outcome: PaymentOutcome,
): Promise<OrderDocument | null> {
  let status: OrderDocument['status']
  let update: { $set: Partial<OrderDocument> }
  if (outcome === 'success') {
    status = 'COMPLETE'
    update = { $set: { status } }
  } else {
    status = 'CANCELLED'
    update = { $set: { status, releaseStatus: 'PENDING' } }
  }

  const updated = await models.OrdersModel.findOneAndUpdate(
    { orderId, status: 'PENDING' },
    update,
    { returnDocument: 'after' },
  )
  if (updated) {
    return updated
  }

  const existing = await models.OrdersModel.findOne({ orderId })
  if (!existing) {
    return null
  }
  if (existing.status === status) {
    return existing
  }
  throw new PaymentOutcomeConflictError(orderId)
}
