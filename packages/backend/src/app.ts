import { corsMiddleware } from '#api/middleware/cors'
import { requestContextMiddleware } from '#api/middleware/request-context'
import type { SessionIdentity } from '#api/middleware/require-session'
import { createApiRouter } from '#api/router'
import type { OrdersRouterOptions } from '#api/orders/router'
import type { Models } from '#types'
import type { RequestHandler } from 'express'
import express from 'express'
import type { Redis } from 'ioredis'

type AppOptions = {
  authHandler?: RequestHandler
  storefrontOrigin?: string
  models?: Models
  resolveSession?: (
    request: express.Request,
  ) => Promise<SessionIdentity | undefined>
  valkey?: Redis
}

export function createApp({
  authHandler,
  storefrontOrigin,
  models,
  resolveSession,
  valkey,
}: AppOptions = {}) {
  const app = express()

  app.disable('x-powered-by')
  app.use(corsMiddleware(storefrontOrigin))
  if (authHandler) app.all('/api/auth/*splat', authHandler)
  app.use(express.json())
  app.use('/api', requestContextMiddleware({ models, valkey }))
  let apiRouterOptions: OrdersRouterOptions | undefined
  if (models && resolveSession) {
    if (!valkey) throw new Error('Order routes require a Valkey client')
    apiRouterOptions = { resolveSession }
  }
  app.use('/api', createApiRouter(apiRouterOptions))

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
