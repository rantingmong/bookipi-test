import express from 'express'
import { describe, expect, it, vi } from 'vitest'
import { requireSession } from '#api/middleware/require-session'

describe('requireSession', () => {
  async function requestWith(
    resolveSession: Parameters<typeof requireSession>[0],
  ) {
    const app = express()
    let incomingRequest: express.Request | undefined
    const protectedHandler = vi.fn(
      (request: express.Request, response: express.Response) => {
        response.json({ customerId: request.sessionIdentity?.customerId })
      },
    )
    const errorHandler = vi.fn(
      (
        _error: unknown,
        _request: express.Request,
        response: express.Response,
        _next: express.NextFunction,
      ) => {
        response
          .status(500)
          .json({ error: 'Internal server error', issues: [] })
      },
    )
    app.use((request, _response, next) => {
      incomingRequest = request
      next()
    })
    app.get('/private', requireSession(resolveSession), protectedHandler)
    app.use(errorHandler)

    const server = app.listen(0)
    const address = server.address()
    if (!address || typeof address === 'string')
      throw new Error('Expected a TCP address')

    try {
      const response = await fetch(`http://127.0.0.1:${address.port}/private`)
      return {
        response,
        body: await response.json(),
        protectedHandler,
        errorHandler,
        incomingRequest,
      }
    } finally {
      server.close()
    }
  }

  it('returns the authentication error and stops a request with no identity', async () => {
    const resolveSession = vi.fn(async () => undefined)
    const { response, body, protectedHandler, incomingRequest } =
      await requestWith(resolveSession)

    expect(resolveSession).toHaveBeenCalledOnce()
    expect(resolveSession).toHaveBeenCalledWith(incomingRequest)
    expect(response.status).toBe(401)
    expect(body).toEqual({ error: 'Authentication required', issues: [] })
    expect(protectedHandler).not.toHaveBeenCalled()
  })

  it('attaches the resolved identity before it calls the protected route', async () => {
    const resolveSession = vi.fn(async () => ({ customerId: 'customer-1' }))
    const { response, body, protectedHandler, incomingRequest } =
      await requestWith(resolveSession)

    expect(resolveSession).toHaveBeenCalledOnce()
    expect(resolveSession).toHaveBeenCalledWith(incomingRequest)
    expect(response.status).toBe(200)
    expect(body).toEqual({ customerId: 'customer-1' })
    expect(protectedHandler).toHaveBeenCalledOnce()
  })

  it('forwards a session resolution error and stops the protected route', async () => {
    const resolverError = new Error('session store unavailable')
    const resolveSession = vi.fn(async (_request: express.Request) => {
      throw resolverError
    })
    const { response, body, protectedHandler, incomingRequest, errorHandler } =
      await requestWith(resolveSession)

    expect(resolveSession).toHaveBeenCalledOnce()
    expect(resolveSession).toHaveBeenCalledWith(incomingRequest)
    expect(response.status).toBe(500)
    expect(body).toEqual({ error: 'Internal server error', issues: [] })
    expect(protectedHandler).not.toHaveBeenCalled()
    expect(errorHandler).toHaveBeenCalledOnce()
    expect(errorHandler.mock.calls[0]?.[0]).toBe(resolverError)
    expect(errorHandler.mock.calls[0]?.[1]).toBe(incomingRequest)
  })
})
