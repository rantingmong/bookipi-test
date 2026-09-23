import type { RequestHandler } from 'express'

const allowedMethods = 'GET, HEAD, POST, OPTIONS'
const allowedHeaders = 'Content-Type, Authorization'

export function corsMiddleware(
  storefrontOrigin = process.env.STOREFRONT_ORIGIN,
): RequestHandler {
  return (request, response, next) => {
    const requestOrigin = request.get('Origin')
    if (!requestOrigin) {
      next()
      return
    }

    response.vary('Origin')
    if (storefrontOrigin && requestOrigin === storefrontOrigin) {
      response.setHeader('Access-Control-Allow-Origin', storefrontOrigin)
      response.setHeader('Access-Control-Allow-Credentials', 'true')
    }

    if (request.method === 'OPTIONS') {
      if (!storefrontOrigin || requestOrigin !== storefrontOrigin) {
        response.status(403).json({ error: 'Origin not allowed', issues: [] })
        return
      }
      response.setHeader('Access-Control-Allow-Methods', allowedMethods)
      response.setHeader('Access-Control-Allow-Headers', allowedHeaders)
      response.status(204).end()
      return
    }

    next()
  }
}
