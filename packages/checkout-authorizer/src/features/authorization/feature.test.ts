import { describe, expect, it, vi } from 'vitest'
import { authorizeCheckoutRequest } from './feature.js'

const baseInput = {
  origin: 'https://store.example.test',
  configuredOrigin: 'https://store.example.test',
  cookie: 'better-auth.session_token=session',
  headers: new Headers({ cookie: 'better-auth.session_token=session' }),
}

describe('checkout authorization feature', () => {
  it.each([
    [{ ...baseInput, origin: undefined }],
    [{ ...baseInput, origin: 'https://evil.example.test' }],
    [{ ...baseInput, origin: 'https://store.example.test/path' }],
    [{ ...baseInput, cookie: undefined }],
  ])(
    'rejects invalid Origin or a missing cookie before session access',
    async (input) => {
      const readSession = vi.fn(async () => ({ user: { id: 'customer-1' } }))
      await expect(
        authorizeCheckoutRequest({ ...input, readSession }),
      ).resolves.toBeUndefined()
      expect(readSession).not.toHaveBeenCalled()
    },
  )

  it('returns only the verified customer ID with Better Auth refresh disabled', async () => {
    const readSession = vi.fn(
      async (_input: {
        headers: Headers
        query: { disableRefresh: true; disableCookieCache: true }
      }) => ({ user: { id: 'customer-1' } }),
    )
    await expect(
      authorizeCheckoutRequest({ ...baseInput, readSession }),
    ).resolves.toBe('customer-1')
    expect(readSession.mock.calls[0]?.[0].query).toEqual({
      disableRefresh: true,
      disableCookieCache: true,
    })
  })

  it.each([null, 'error'] as const)(
    'denies absent sessions and session errors',
    async (result) => {
      const readSession = vi.fn(async () => {
        if (result === 'error') throw new Error('Valkey error')
        return null
      })
      await expect(
        authorizeCheckoutRequest({ ...baseInput, readSession }),
      ).resolves.toBeUndefined()
    },
  )
})
