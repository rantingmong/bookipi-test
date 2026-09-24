import { describe, expect, it, vi } from 'vitest'
import {
  createAuthFeatureOptions,
  resolveSessionIdentity,
} from '#features/auth/feature'
import { readEnvConfig } from '#features/env/feature'
import { authSessionKeyPrefix } from '#services/valkey/client'

const environment = {
  BETTER_AUTH_URL: 'http://localhost:3001',
  BETTER_AUTH_SECRET: 'local-test-secret',
  MONGODB_URI: 'mongodb://localhost:27017',
  MONGODB_DATABASE: 'bookipi',
  VALKEY_URL: 'redis://localhost:6379',
}

describe('auth feature', () => {
  it('uses MongoDB for auth data and Valkey-only session storage', () => {
    const database = vi.fn()
    const secondaryStorage = { get: vi.fn(), set: vi.fn(), delete: vi.fn() }
    const config = readEnvConfig({
      ...environment,
      STOREFRONT_ORIGIN: 'https://store.example.test',
    })

    expect(
      createAuthFeatureOptions({
        config,
        database: database as never,
        secondaryStorage: secondaryStorage as never,
      }),
    ).toMatchObject({
      baseURL: environment.BETTER_AUTH_URL,
      basePath: '/api/auth',
      database,
      secondaryStorage,
      emailAndPassword: { enabled: true },
      session: { storeSessionInDatabase: false },
      trustedOrigins: ['https://store.example.test'],
    })
    expect(authSessionKeyPrefix).toBe('bookipi:auth:')
  })

  it('maps Better Auth session users to customer identities and leaves storage errors visible', async () => {
    const getSession = vi.fn(async (_input: { headers: Headers }) => ({
      user: { id: 'customer-1' },
    }))
    const headers = { cookie: 'session=opaque' }

    await expect(
      resolveSessionIdentity({ api: { getSession } }, headers),
    ).resolves.toEqual({ customerId: 'customer-1' })
    expect(getSession).toHaveBeenCalledWith({ headers: expect.any(Headers) })
    expect(
      (getSession.mock.calls[0]?.[0].headers as Headers).get('cookie'),
    ).toBe('session=opaque')
    await expect(
      resolveSessionIdentity({ api: { getSession: async () => null } }, {}),
    ).resolves.toBeUndefined()

    const storageError = new Error('Valkey unavailable')
    await expect(
      resolveSessionIdentity(
        {
          api: {
            getSession: async () => {
              throw storageError
            },
          },
        },
        {},
      ),
    ).rejects.toBe(storageError)
  })
})
