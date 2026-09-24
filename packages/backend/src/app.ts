import express from 'express'
import type { RequestHandler } from 'express'

import { apiRouter } from '#api/router'
import { corsMiddleware } from './api/middleware/cors.js'

type AppOptions = { authHandler?: RequestHandler; storefrontOrigin?: string }

export function createApp({ authHandler, storefrontOrigin }: AppOptions = {}) {
  const app = express()

  app.disable('x-powered-by')
  app.use(corsMiddleware(storefrontOrigin))
  if (authHandler) app.all('/api/auth/*splat', authHandler)
  app.use(express.json())
  app.use('/api', apiRouter)

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
