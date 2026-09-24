import { corsMiddleware } from '#api/middleware/cors'
import type { SessionIdentity } from '#api/middleware/require-session'
import { createOrdersRouter } from '#api/orders/router'
import { apiRouter } from '#api/router'
import type { OrderDocument } from '#features/order/types'
import type { RequestHandler } from 'express'
import express from 'express'
import type { Redis } from 'ioredis'
import type { Model } from 'mongoose'

type AppOptions = {
  authHandler?: RequestHandler
  storefrontOrigin?: string
  ordersModel?: Pick<
    Model<OrderDocument>,
    'findOne' | 'findOneAndUpdate' | 'updateOne'
  >
  resolveSession?: (
    request: express.Request,
  ) => Promise<SessionIdentity | undefined>
  mockPaymentEnabled?: boolean
  valkey?: Redis
}

export function createApp({
  authHandler,
  storefrontOrigin,
  ordersModel,
  resolveSession,
  mockPaymentEnabled = false,
  valkey,
}: AppOptions = {}) {
  const app = express()

  app.disable('x-powered-by')
  app.use(corsMiddleware(storefrontOrigin))
  if (authHandler) app.all('/api/auth/*splat', authHandler)
  app.use(express.json())
  app.use('/api', apiRouter)
  if (ordersModel && resolveSession) {
    if (!valkey) throw new Error('Order routes require a Valkey client')
    app.use(
      '/api',
      createOrdersRouter({
        ordersModel,
        resolveSession,
        mockPaymentEnabled,
        valkey,
      }),
    )
  }

  app.use(
    (
      error: unknown,
      _request: express.Request,
      response: express.Response,
      _next: express.NextFunction,
    ) => {
      let status = 500
      let message = 'Internal server error'
      if (error instanceof SyntaxError) {
        status = 400
        message = 'Invalid request body'
      }
      response.status(status).json({ error: message, issues: [] })
    },
  )

  return app
}

export const app = createApp()
