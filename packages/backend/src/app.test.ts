import type { RequestHandler } from 'express'
import { describe, expect, it } from 'vitest'

import { app as defaultApp, createApp } from '#app'
import { readEnvConfig } from '#features/env/feature'

describe('createApp', () => {
  it('passes the raw auth request stream before JSON parsing', async () => {
    let receivedBody = ''
    const authHandler: RequestHandler = async (request, response) => {
      for await (const chunk of request) receivedBody += chunk.toString()
      response.status(200).send('auth handled')
    }
    const app = createApp({ authHandler })
    const server = app.listen(0)
    const address = server.address()
    if (!address || typeof address === 'string')
      throw new Error('Expected a TCP address')

    try {
      const response = await fetch(
        `http://127.0.0.1:${address.port}/api/auth/sign-in/email`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{"email":"customer@example.test"}',
        },
      )

      expect(response.status).toBe(200)
      expect(await response.text()).toBe('auth handled')
      expect(receivedBody).toBe('{"email":"customer@example.test"}')
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error)
            return
          }
          resolve()
        })
      })
    }
  })

  it('keeps the health route available on the default app', async () => {
    const server = defaultApp.listen(0)
    const address = server.address()
    if (!address || typeof address === 'string')
      throw new Error('Expected a TCP address')

    try {
      const response = await fetch(
        `http://127.0.0.1:${address.port}/api/system/health`,
      )

      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ status: 'ok' })
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error)
            return
          }
          resolve()
        })
      })
    }
  })

  it('uses the validated storefront origin for auth preflight requests', async () => {
    const config = readEnvConfig({
      BETTER_AUTH_URL: 'http://localhost:3001',
      BETTER_AUTH_SECRET: 'local-test-secret',
      MONGODB_URI: 'mongodb://localhost:27017',
      MONGODB_DATABASE: 'bookipi',
      VALKEY_URL: 'redis://localhost:6379',
      STOREFRONT_ORIGIN: '  https://store.example.test  ',
    })
    const app = createApp({ storefrontOrigin: config.storefrontOrigin })
    const server = app.listen(0)
    const address = server.address()
    if (!address || typeof address === 'string')
      throw new Error('Expected a TCP address')

    try {
      const response = await fetch(
        `http://127.0.0.1:${address.port}/api/auth/sign-up/email`,
        {
          method: 'OPTIONS',
          headers: {
            Origin: 'https://store.example.test',
            'Access-Control-Request-Method': 'POST',
          },
        },
      )

      expect(response.status).toBe(204)
      expect(response.headers.get('access-control-allow-origin')).toBe(
        'https://store.example.test',
      )
      expect(response.headers.get('access-control-allow-credentials')).toBe(
        'true',
      )
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error)
            return
          }
          resolve()
        })
      })
    }
  })
})
