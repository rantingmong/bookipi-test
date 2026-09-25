import { Router } from 'express'
import { createListingsRouter } from '#api/listings/router'
import { createOrdersRouter } from '#api/orders/router'
import type { OrdersRouterOptions } from '#api/orders/router'
import { createSystemRouter } from '#api/system/router'

export function createApiRouter(options?: OrdersRouterOptions) {
  const router = Router()

  router.use('/system', createSystemRouter())
  router.use(createListingsRouter())
  if (options) router.use(createOrdersRouter(options))

  return router
}
