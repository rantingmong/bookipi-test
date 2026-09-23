import { describe, expect, it } from 'vitest'
import { readEnvConfig } from './feature.js'

const environment = {
  BETTER_AUTH_URL: 'http://localhost:3001',
  BETTER_AUTH_SECRET: 'local-test-secret',
  MONGODB_URI: 'mongodb://localhost:27017',
  MONGODB_DATABASE: 'bookipi',
  VALKEY_URL: 'redis://localhost:6379',
}

describe('environment feature', () => {
  it('validates required settings and accepts only an exact optional storefront origin', () => {
    expect(readEnvConfig(environment)).toMatchObject({
      authUrl: environment.BETTER_AUTH_URL,
      authSecret: environment.BETTER_AUTH_SECRET,
      mongoUri: environment.MONGODB_URI,
      mongoDatabase: environment.MONGODB_DATABASE,
      valkeyUrl: environment.VALKEY_URL,
    })
    expect(() =>
      readEnvConfig({ ...environment, MONGODB_DATABASE: '' }),
    ).toThrow('Missing required environment variable MONGODB_DATABASE')
    expect(() =>
      readEnvConfig({
        ...environment,
        BETTER_AUTH_URL: 'http://localhost:3001/api/auth',
      }),
    ).toThrow('BETTER_AUTH_URL must be an HTTP or HTTPS origin without a path')
    expect(() =>
      readEnvConfig({
        ...environment,
        STOREFRONT_ORIGIN: 'https://store.example.test/path',
      }),
    ).toThrow('STOREFRONT_ORIGIN must be an exact origin without a path')
    expect(
      readEnvConfig({
        ...environment,
        STOREFRONT_ORIGIN: 'https://store.example.test',
      }).storefrontOrigin,
    ).toBe('https://store.example.test')
  })
})
