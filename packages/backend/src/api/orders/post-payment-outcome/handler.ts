import { HttpError } from '#api/orders/generated/_shared/errors'
import type { Order } from '#api/orders/generated/models'
import { toOrderResponse } from '#api/orders/get-order/handler'
import { getOrdersRequestContext } from '#api/orders/request-context'
import { reconcileCancelledOrderRelease } from '#features/order/feature'
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

  const { identity, ordersModel, valkey } = getOrdersRequestContext()
  const order = await ordersModel.findOne({
    orderId,
    customerId: identity.customerId,
  })
  if (!order) {
    throw new HttpError(404, 'Not found')
  }

  try {
    const updated = await applyPaymentOutcome(
      ordersModel,
      orderId,
      parsedBody.data.outcome,
    )
    if (!updated) {
      throw new HttpError(404, 'Not found')
    }
    await reconcileCancelledOrderRelease(updated, { ordersModel, valkey })
    return toOrderResponse(updated)
  } catch (error) {
    if (error instanceof PaymentOutcomeConflictError) {
      throw new HttpError(409, 'Order already has a different outcome')
    }
    throw error
  }
}
