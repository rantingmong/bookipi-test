import { describe, expect, it } from 'vitest'
import { parseEnvironment } from './feature.js'

const validEnvironment = {
  BETTER_AUTH_URL: 'https://api.example.test',
  BETTER_AUTH_SECRET: 'secret',
  STOREFRONT_ORIGIN: 'https://store.example.test',
  VALKEY_URL: 'redis://localhost:6379',
}

describe('authorizer environment', () => {
  it('accepts the required auth, origin, and Valkey settings', () => {
    expect(parseEnvironment(validEnvironment)).toEqual(validEnvironment)
  })

  it('rejects an origin that has a path or is missing', () => {
    expect(() =>
      parseEnvironment({
        ...validEnvironment,
        STOREFRONT_ORIGIN: 'https://store.example.test/path',
      }),
    ).toThrow()
    expect(() =>
      parseEnvironment({ ...validEnvironment, STOREFRONT_ORIGIN: undefined }),
    ).toThrow()
  })
})
