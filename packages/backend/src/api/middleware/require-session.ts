import type { NextFunction, Request, RequestHandler, Response } from 'express'

export type SessionIdentity = { customerId: string }

declare global {
  namespace Express {
    interface Request {
      sessionIdentity?: SessionIdentity
    }
  }
}

export function requireSession(resolveSession: (request: Request) => Promise<SessionIdentity | undefined>): RequestHandler {
  return async (request: Request, response: Response, next: NextFunction) => {
    try {
      const identity = await resolveSession(request)
      if (!identity) {
        response.status(401).json({ error: 'Authentication required', issues: [] })
        return
      }
      request.sessionIdentity = identity
      next()
    } catch (error) {
      next(error)
    }
  }
}
