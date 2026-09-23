import express from 'express'

import { apiRouter } from '#api/router'
import { corsMiddleware } from './api/middleware/cors.js'

export const app = express()

app.disable('x-powered-by')
app.use(corsMiddleware())
app.use(express.json())
app.use('/api', apiRouter)

app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  const status = error instanceof SyntaxError ? 400 : 500
  const message = status === 400 ? 'Invalid request body' : 'Internal server error'
  response.status(status).json({ error: message, issues: [] })
})
