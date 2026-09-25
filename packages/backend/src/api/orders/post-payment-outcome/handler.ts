import { HttpError } from '#api/orders/generated/_shared/errors'
import type { Order } from '#api/orders/generated/models'
import { toOrderResponse } from '#api/orders/get-order/handler'
import {
  getRequestIdentity,
  getRequestModels,
  getRequestValkey,
} from '#api/middleware/request-context'
import {
  findOwnedOrder,
  OrderNotFoundError,
  reconcileCancelledOrderRelease,
} from '#features/order/feature'
import {
  applyPaymentOutcome,
  PaymentOutcomeConflictError,
  paymentOutcomeSchema,
} from '#features/payment/feature'

export async function postPaymentOutcome(
  orderId: string,
  body: unknown,
): Promise<Order> {
  const parsedBody = paymentOutcomeSchema.safeParse(body)
  if (!parsedBody.success) {
    throw new HttpError(400, 'Invalid mock outcome')
  }

  const identity = getRequestIdentity()
  const models = getRequestModels()
  const valkey = getRequestValkey()
  try {
    await findOwnedOrder(models, orderId, identity.customerId)
    const updated = await applyPaymentOutcome(
      models,
      orderId,
      parsedBody.data.outcome,
    )
    if (!updated) {
      throw new HttpError(404, 'Not found')
    }
    await reconcileCancelledOrderRelease(updated, { models, valkey })
    return toOrderResponse(updated)
  } catch (error) {
    if (error instanceof OrderNotFoundError) {
      throw new HttpError(404, 'Not found')
    }
    if (error instanceof PaymentOutcomeConflictError) {
      throw new HttpError(409, 'Order already has a different outcome')
    }
    throw error
  }
}
