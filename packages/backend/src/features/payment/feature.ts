import { paymentOutcomeSchema } from '#features/payment/schema'
import type { PaymentOrderModel, PaymentOutcome } from '#features/payment/types'
import type { OrderDocument } from '#features/order/types'

export { paymentOutcomeSchema }

export class PaymentOutcomeConflictError extends Error {
  constructor(orderId: string) {
    super(`Conflicting payment outcome for order ${orderId}`)
    this.name = 'PaymentOutcomeConflictError'
  }
}

export async function applyPaymentOutcome(
  ordersModel: PaymentOrderModel,
  orderId: string,
  outcome: PaymentOutcome,
): Promise<OrderDocument | null> {
  let status: OrderDocument['status']
  if (outcome === 'success') {
    status = 'COMPLETE'
  } else {
    status = 'CANCELLED'
  }

  const updated = await ordersModel.findOneAndUpdate(
    { orderId, status: 'PENDING' },
    { $set: { status } },
    { returnDocument: 'after' },
  )
  if (updated) {
    return updated
  }

  const existing = await ordersModel.findOne({ orderId })
  if (!existing) {
    return null
  }
  if (existing.status === status) {
    return existing
  }
  throw new PaymentOutcomeConflictError(orderId)
}
