import { createApp, app as defaultApp } from '#app'
import { readEnvConfig } from '#features/env/feature'
import type { Models } from '#types'
import type { RequestHandler } from 'express'
import { describe, expect, it, vi } from 'vitest'

function createModels(
  overrides: {
    ListingModel?: object
    ListingSlotModel?: object
    OrdersModel?: object
  } = {},
): Models {
  return {
    ListingModel: {},
    ListingSlotModel: {},
    OrdersModel: {},
    ...overrides,
  } as unknown as Models
}

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
    const findOne = async (query: Record<string, unknown>) => {
      if (
        query.orderId === 'order-001' &&
        query.customerId === 'customer-001'
      ) {
        return order
      }
      if (
        query.listingId === 'listing-001' &&
        query.customerId === 'customer-001' &&
        typeof query.status === 'object'
      ) {
        return order
      }
      return null
    }
    const app = createApp({
      models: createModels({
        OrdersModel: { findOne, findOneAndUpdate: async () => null },
      }),
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

      const currentResponse = await fetch(
        `http://127.0.0.1:${address.port}/api/orders/current?listingId=listing-001`,
      )
      expect(currentResponse.status).toBe(200)
      expect(await currentResponse.json()).toMatchObject({
        orderId: 'order-001',
        listingId: 'listing-001',
        status: 'PENDING',
      })

      const absentResponse = await fetch(
        `http://127.0.0.1:${address.port}/api/orders/missing`,
      )
      expect(absentResponse.status).toBe(404)
      expect(await absentResponse.json()).toEqual({ error: 'Not found' })

      const anonymousApp = createApp({
        models: createModels({
          OrdersModel: { findOne, findOneAndUpdate: async () => null },
        }),
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
      const anonymousCurrentResponse = await fetch(
        `http://127.0.0.1:${anonymousAddress.port}/api/orders/current?listingId=listing-001`,
      )
      expect(anonymousCurrentResponse.status).toBe(401)
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

  it('applies mock outcomes when order routes are configured', async () => {
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
    const enabledApp = createApp({
      models: createModels({ OrdersModel: ordersModel }),
      resolveSession: resolver,
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
      models: createModels({ OrdersModel: ordersModel }),
      resolveSession: async () => ({ customerId: 'customer-001' }),
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

  it('serves public listing status and returns 404 for an unknown listing', async () => {
    const findOne = vi.fn(async ({ listingId }: { listingId: string }) => {
      if (listingId !== 'sale-1') return null
      return {
        listingId,
        productName: 'Bookipi Pro',
        saleStartsAt: new Date('2026-10-01T10:00:00.000Z'),
        saleEndsAt: new Date('2026-10-01T11:00:00.000Z'),
        reserveSlots: 2,
      }
    })
    const countDocuments = vi.fn(async () => 10)
    const countOrders = vi.fn(async () => 0)
    const app = createApp({
      models: createModels({
        ListingModel: { findOne },
        ListingSlotModel: { countDocuments },
        OrdersModel: { countDocuments: countOrders },
      }),
    })
    const server = app.listen(0)
    const address = server.address()
    if (!address || typeof address === 'string')
      throw new Error('Expected a TCP address')

    try {
      const response = await fetch(
        `http://127.0.0.1:${address.port}/api/listings/sale-1`,
      )
      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({
        listingId: 'sale-1',
        productName: 'Bookipi Pro',
        saleStartsAt: '2026-10-01T10:00:00.000Z',
        saleEndsAt: '2026-10-01T11:00:00.000Z',
        stockTotal: 10,
        reserveSlots: 2,
        publicStock: 8,
        boughtUnits: 0,
        remainingUnits: 8,
      })

      const missing = await fetch(
        `http://127.0.0.1:${address.port}/api/listings/missing`,
      )
      expect(missing.status).toBe(404)
      expect(await missing.json()).toEqual({ error: 'Not found' })
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
