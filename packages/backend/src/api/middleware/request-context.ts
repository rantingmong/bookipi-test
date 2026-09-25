import type { Models } from '#types'
import type { Request, RequestHandler } from 'express'
import type { Redis } from 'ioredis'
import { AsyncLocalStorage } from 'node:async_hooks'

export type RequestContext = {
  request: Request
  models?: Models
  valkey?: Redis
}

const requestContext = new AsyncLocalStorage<RequestContext>()

export function requestContextMiddleware(dependencies: {
  models?: Models
  valkey?: Redis
}): RequestHandler {
  return (request, _response, next) => {
    requestContext.run({ ...dependencies, request }, next)
  }
}

export function getRequestContext(): RequestContext {
  const context = requestContext.getStore()
  if (!context) throw new Error('Request context is not available')
  return context
}

export function getRequestModels(): Models {
  const models = getRequestContext().models
  if (!models) throw new Error('Request models are not available')
  return models
}

export function getRequestIdentity(): { customerId: string } {
  const identity = getRequestContext().request.sessionIdentity
  if (!identity) throw new Error('Session identity is not available')
  return identity
}

export function getRequestValkey(): Redis {
  const valkey = getRequestContext().valkey
  if (!valkey) throw new Error('Request Valkey client is not available')
  return valkey
}
