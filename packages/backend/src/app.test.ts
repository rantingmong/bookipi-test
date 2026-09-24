import { createApp, app as defaultApp } from '#app'
import { readEnvConfig } from '#features/env/feature'
import type { RequestHandler } from 'express'
import { describe, expect, it, vi } from 'vitest'

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

  it('protects order reads and hides absent or non-owned orders', async () => {
    const order = {
      orderId: 'order-001',
      customerId: 'customer-001',
      listingId: 'listing-001',
      slotId: 'listing-001:slot:0001',
      status: 'PENDING',
      createdAt: new Date('2026-09-24T00:00:00.000Z'),
      updatedAt: new Date('2026-09-24T00:00:00.000Z'),
    }
    const findOne = async (query: Record<string, string>) => {
      if (
        query.orderId === 'order-001' &&
        query.customerId === 'customer-001'
      ) {
        return order
      }
      return null
    }
    const app = createApp({
      ordersModel: { findOne, findOneAndUpdate: async () => null } as never,
      resolveSession: async () => ({ customerId: 'customer-001' }),
      valkey: { eval: vi.fn() } as never,
    })
    const server = app.listen(0)
    const address = server.address()
    if (!address || typeof address === 'string')
      throw new Error('Expected a TCP address')

    try {
      const ownedResponse = await fetch(
        `http://127.0.0.1:${address.port}/api/orders/order-001`,
      )
      expect(ownedResponse.status).toBe(200)
      expect(await ownedResponse.json()).toMatchObject({
        orderId: 'order-001',
        customerId: 'customer-001',
        status: 'PENDING',
      })

      const absentResponse = await fetch(
        `http://127.0.0.1:${address.port}/api/orders/missing`,
      )
      expect(absentResponse.status).toBe(404)
      expect(await absentResponse.json()).toEqual({ error: 'Not found' })

      const anonymousApp = createApp({
        ordersModel: { findOne, findOneAndUpdate: async () => null } as never,
        resolveSession: async () => undefined,
        valkey: { eval: vi.fn() } as never,
      })
      const anonymousServer = anonymousApp.listen(0)
      const anonymousAddress = anonymousServer.address()
      if (!anonymousAddress || typeof anonymousAddress === 'string')
        throw new Error('Expected a TCP address')
      const anonymousResponse = await fetch(
        `http://127.0.0.1:${anonymousAddress.port}/api/orders/order-001`,
      )
      expect(anonymousResponse.status).toBe(401)
      await new Promise<void>((resolve, reject) => {
        anonymousServer.close((error) => {
          if (error) reject(error)
          else resolve()
        })
      })
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error)
          else resolve()
        })
      })
    }
  })

  it('hides mock outcomes when disabled and applies an enabled outcome', async () => {
    let status = 'PENDING'
    const order = {
      orderId: 'order-001',
      customerId: 'customer-001',
      listingId: 'listing-001',
      slotId: 'listing-001:slot:0001',
      get status() {
        return status
      },
      createdAt: new Date('2026-09-24T00:00:00.000Z'),
      updatedAt: new Date('2026-09-24T00:00:00.000Z'),
    }
    const ordersModel = {
      findOne: async () => order,
      findOneAndUpdate: async (
        _filter: unknown,
        update: { $set: { status: string; releaseStatus?: string } },
      ) => {
        if (status !== 'PENDING') return null
        status = update.$set.status
        return order
      },
      updateOne: async () => ({ modifiedCount: 1 }),
    }
    const evalScript = vi.fn(async () => 1)
    const resolver = vi.fn(async () => ({ customerId: 'customer-001' }))
    const disabledApp = createApp({
      ordersModel: ordersModel as never,
      resolveSession: resolver,
      mockPaymentEnabled: false,
      valkey: { eval: evalScript } as never,
    })
    const disabledServer = disabledApp.listen(0)
    const disabledAddress = disabledServer.address()
    if (!disabledAddress || typeof disabledAddress === 'string')
      throw new Error('Expected a TCP address')

    try {
      const disabledResponse = await fetch(
        `http://127.0.0.1:${disabledAddress.port}/api/orders/order-001/payment-outcome`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ outcome: 'success' }),
        },
      )
      expect(disabledResponse.status).toBe(404)
      expect(await disabledResponse.json()).toEqual({
        error: 'Not found',
        issues: [],
      })
      expect(resolver).not.toHaveBeenCalled()
    } finally {
      await new Promise<void>((resolve, reject) => {
        disabledServer.close((error) => {
          if (error) reject(error)
          else resolve()
        })
      })
    }

    const enabledApp = createApp({
      ordersModel: ordersModel as never,
      resolveSession: resolver,
      mockPaymentEnabled: true,
      valkey: { eval: evalScript } as never,
    })
    const enabledServer = enabledApp.listen(0)
    const enabledAddress = enabledServer.address()
    if (!enabledAddress || typeof enabledAddress === 'string')
      throw new Error('Expected a TCP address')

    try {
      const response = await fetch(
        `http://127.0.0.1:${enabledAddress.port}/api/orders/order-001/payment-outcome`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ outcome: 'success' }),
        },
      )
      expect(response.status).toBe(200)
      expect(await response.json()).toMatchObject({ status: 'COMPLETE' })
      expect(evalScript).not.toHaveBeenCalled()
    } finally {
      await new Promise<void>((resolve, reject) => {
        enabledServer.close((error) => {
          if (error) reject(error)
          else resolve()
        })
      })
    }
  })

  it('accepts failure and retries expiry as the same terminal status', async () => {
    let status = 'PENDING'
    let releaseStatus: string | undefined
    const order = {
      orderId: 'order-expire',
      customerId: 'customer-001',
      listingId: 'listing-001',
      slotId: 'listing-001:slot:0001',
      get status() {
        return status
      },
      get releaseStatus() {
        return releaseStatus
      },
      createdAt: new Date('2026-09-24T00:00:00.000Z'),
      updatedAt: new Date('2026-09-24T00:00:00.000Z'),
    }
    const ordersModel = {
      findOne: async () => order,
      findOneAndUpdate: async (
        _filter: unknown,
        update: { $set: { status: string; releaseStatus?: string } },
      ) => {
        if (status !== 'PENDING') return null
        status = update.$set.status
        releaseStatus = update.$set.releaseStatus
        return order
      },
      updateOne: async (
        _filter: unknown,
        update: { $set: { releaseStatus: string } },
      ) => {
        releaseStatus = update.$set.releaseStatus
        return { modifiedCount: 1 }
      },
    }
    const evalScript = vi.fn(async () => 1)
    const app = createApp({
      ordersModel: ordersModel as never,
      resolveSession: async () => ({ customerId: 'customer-001' }),
      mockPaymentEnabled: true,
      valkey: { eval: evalScript } as never,
    })
    const server = app.listen(0)
    const address = server.address()
    if (!address || typeof address === 'string')
      throw new Error('Expected a TCP address')
    const port = address.port

    async function submit(outcome: unknown) {
      return fetch(
        `http://127.0.0.1:${port}/api/orders/order-expire/payment-outcome`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ outcome }),
        },
      )
    }

    try {
      expect((await submit('invalid')).status).toBe(400)
      const failure = await submit('failure')
      expect(failure.status).toBe(200)
      expect(await failure.json()).toMatchObject({ status: 'CANCELLED' })
      expect(releaseStatus).toBe('COMPLETE')
      expect(evalScript).toHaveBeenCalledOnce()

      const retry = await submit('expired')
      expect(retry.status).toBe(200)
      expect(await retry.json()).toMatchObject({ status: 'CANCELLED' })
      expect(evalScript).toHaveBeenCalledOnce()

      const conflict = await submit('success')
      expect(conflict.status).toBe(409)
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error)
          else resolve()
        })
      })
    }
  })
})
