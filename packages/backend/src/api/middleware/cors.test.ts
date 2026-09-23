import express from 'express'
import { describe, expect, it } from 'vitest'
import { corsMiddleware } from './cors.js'

const storefrontOrigin = 'https://store.example.test'

async function withCors(storefrontOriginSetting: string | undefined, callback: (url: string) => Promise<void>) {
  const app = express()
  app.use(corsMiddleware(storefrontOriginSetting))
  app.get('/health', (_request, response) => response.json({ status: 'ok' }))
  app.get('/failure', (_request, _response, next) => next(new Error('route failed')))
  app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
    response.status(500).json({ error: 'Internal server error', issues: [] })
  })
  const server = app.listen(0)
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Expected a TCP address')
  try {
    await callback(`http://127.0.0.1:${address.port}`)
  } finally {
    server.close()
  }
}

describe('corsMiddleware', () => {
  it('allows the configured exact origin on success and error responses', async () => {
    await withCors(storefrontOrigin, async (url) => {
      for (const path of ['/health', '/failure']) {
        const response = await fetch(`${url}${path}`, { headers: { Origin: storefrontOrigin } })
        expect(response.headers.get('access-control-allow-origin')).toBe(storefrontOrigin)
        expect(response.headers.get('access-control-allow-credentials')).toBe('true')
        expect(response.headers.get('vary')).toContain('Origin')
      }
    })
  })

  it('answers preflight only for the configured origin', async () => {
    await withCors(storefrontOrigin, async (url) => {
      const allowed = await fetch(`${url}/health`, {
        method: 'OPTIONS',
        headers: {
          Origin: storefrontOrigin,
          'Access-Control-Request-Method': 'GET',
          'Access-Control-Request-Headers': 'content-type',
        },
      })
      expect(allowed.status).toBe(204)
      expect(allowed.headers.get('access-control-allow-methods')).toContain('GET')
      expect(allowed.headers.get('access-control-allow-headers')).toContain('Content-Type')

      const rejected = await fetch(`${url}/health`, {
        method: 'OPTIONS',
        headers: { Origin: 'https://other.example.test', 'Access-Control-Request-Method': 'GET' },
      })
      expect(rejected.status).toBe(403)
      expect(rejected.headers.get('access-control-allow-origin')).toBeNull()
    })
  })

  it('keeps same-origin requests working when no storefront origin is configured', async () => {
    await withCors(undefined, async (url) => {
      const response = await fetch(`${url}/health`)
      expect(response.status).toBe(200)
      expect(response.headers.get('access-control-allow-origin')).toBeNull()
    })
  })
})
