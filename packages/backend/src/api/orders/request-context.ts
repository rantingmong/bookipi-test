import { AsyncLocalStorage } from 'node:async_hooks'
import type { SessionIdentity } from '#api/middleware/require-session'
import type { OrderDocument } from '#features/order/types'
import type { Model } from 'mongoose'

export type OrdersModel = Pick<
  Model<OrderDocument>,
  'findOne' | 'findOneAndUpdate'
>

export type OrdersRequestContext = {
  ordersModel: OrdersModel
  identity: SessionIdentity
}

const requestContext = new AsyncLocalStorage<OrdersRequestContext>()

export function runWithOrdersRequestContext(
  context: OrdersRequestContext,
  next: () => void,
) {
  requestContext.run(context, next)
}

export function getOrdersRequestContext() {
  const context = requestContext.getStore()
  if (!context) {
    throw new Error('Order handler has no request context')
  }
  return context
}
