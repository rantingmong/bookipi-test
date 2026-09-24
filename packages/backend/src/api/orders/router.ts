import type { Request } from 'express'
import { Router } from 'express'

import { requireSession } from '#api/middleware/require-session'
import { validateRequest } from '#api/middleware/validate'
import { createRouter } from '#api/orders/generated/router'
import { ordersHandlers } from '#api/orders/generated/handlers'
import { runWithOrdersRequestContext } from '#api/orders/request-context'
import { orderIdSchema } from '#features/order/schema'
import { paymentOutcomeSchema } from '#features/payment/schema'
import type { SessionIdentity } from '#api/middleware/require-session'
import type { OrdersModel } from '#api/orders/request-context'
import type { Redis } from 'ioredis'

type OrdersRouterOptions = {
  ordersModel: OrdersModel
  resolveSession: (request: Request) => Promise<SessionIdentity | undefined>
  mockPaymentEnabled: boolean
  valkey: Redis
}

export function createOrdersRouter({
  ordersModel,
  resolveSession,
  mockPaymentEnabled,
  valkey,
}: OrdersRouterOptions) {
  const router = Router()

  router.use('/orders/:orderId/payment-outcome', (_request, response, next) => {
    if (!mockPaymentEnabled) {
      response.status(404).json({ error: 'Not found', issues: [] })
      return
    }
    next()
  })

  router.use(requireSession(resolveSession), (request, _response, next) => {
    const identity = request.sessionIdentity
    if (!identity) {
      next(new Error('Session middleware did not set an identity'))
      return
    }
    runWithOrdersRequestContext({ ordersModel, identity, valkey }, next)
  })
  router.use('/orders/:orderId', validateRequest('params', orderIdSchema))
  router.use(
    '/orders/:orderId/payment-outcome',
    validateRequest('body', paymentOutcomeSchema),
  )
  router.use(createRouter(ordersHandlers))
  return router
}
