import type { NextFunction, Request, RequestHandler, Response } from 'express'
import type { ZodType } from 'zod'

type RequestPart = 'body' | 'params' | 'query'

export function validateRequest(part: RequestPart, schema: ZodType): RequestHandler {
  return (request: Request, response: Response, next: NextFunction) => {
    const result = schema.safeParse(request[part])
    if (!result.success) {
      response.status(400).json({ error: 'Invalid request', issues: result.error.issues })
      return
    }
    response.locals.validatedRequest = {
      ...response.locals.validatedRequest,
      [part]: result.data,
    }
    next()
  }
}
