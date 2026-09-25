import type { Request } from 'express'
import { Router } from 'express'

import { requireSession } from '#api/middleware/require-session'
import { validateRequest } from '#api/middleware/validate'
import { createRouter } from '#api/orders/generated/router'
import { ordersHandlers } from '#api/orders/generated/handlers'
import { orderIdSchema } from '#features/order/schema'
import { paymentOutcomeSchema } from '#features/payment/schema'
import type { SessionIdentity } from '#api/middleware/require-session'

export type OrdersRouterOptions = {
  resolveSession: (request: Request) => Promise<SessionIdentity | undefined>
}

export function createOrdersRouter({ resolveSession }: OrdersRouterOptions) {
  const router = Router()

  router.use(requireSession(resolveSession))
  router.use('/orders/:orderId', validateRequest('params', orderIdSchema))
  router.use(
    '/orders/:orderId/payment-outcome',
    validateRequest('body', paymentOutcomeSchema),
  )
  router.use(createRouter(ordersHandlers))
  return router
}
