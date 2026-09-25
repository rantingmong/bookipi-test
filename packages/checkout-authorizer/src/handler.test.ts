import type { APIGatewayRequestAuthorizerEvent } from 'aws-lambda'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { handler } from './handler.js'
import { getRuntime } from './runtime.js'

vi.mock('./runtime.js', () => ({ getRuntime: vi.fn() }))

function request(origin?: string, cookie?: string) {
  const headers: Record<string, string> = {}
  if (origin !== undefined) headers.Origin = origin
  if (cookie !== undefined) headers.Cookie = cookie
  return {
    type: 'REQUEST',
    methodArn: 'arn:aws:execute-api:region:account:api/stage/POST/checkout',
    headers,
  } as unknown as APIGatewayRequestAuthorizerEvent
}

describe('checkout REQUEST authorizer', () => {
  beforeEach(() => {
    vi.mocked(getRuntime).mockReset()
    process.env.STOREFRONT_ORIGIN = 'https://store.example.test'
    process.env.BETTER_AUTH_URL = 'https://api.example.test'
    process.env.BETTER_AUTH_SECRET = 'test-secret'
    process.env.VALKEY_URL = 'redis://localhost:6379'
  })

  it.each([undefined, 'https://evil.example.test'])(
    'denies missing or unapproved Origin before runtime access',
    async (origin) => {
      await expect(
        handler(request(origin, 'better-auth.session_token=x')),
      ).resolves.toMatchObject({
        principalId: 'anonymous',
        policyDocument: { Statement: [{ Effect: 'Deny' }] },
      })
      expect(getRuntime).not.toHaveBeenCalled()
    },
  )

  it('denies a missing cookie without connecting to Valkey', async () => {
    await expect(
      handler(request('https://store.example.test')),
    ).resolves.toMatchObject({
      policyDocument: { Statement: [{ Effect: 'Deny' }] },
    })
    expect(getRuntime).not.toHaveBeenCalled()
  })

  it('passes only the verified customer ID to API Gateway', async () => {
    const getSession = vi.fn(
      async (input: {
        query: { disableRefresh: true; disableCookieCache: true }
      }) => {
        void input
        return { user: { id: 'customer-1' } }
      },
    )
    vi.mocked(getRuntime).mockReturnValue({ getSession } as never)

    await expect(
      handler(
        request('https://store.example.test', 'better-auth.session_token=x'),
      ),
    ).resolves.toMatchObject({
      principalId: 'customer-1',
      context: { customerId: 'customer-1' },
      policyDocument: { Statement: [{ Effect: 'Allow' }] },
    })
    expect(getSession).toHaveBeenCalledOnce()
    expect(getSession.mock.calls[0]?.[0].query).toEqual({
      disableRefresh: true,
      disableCookieCache: true,
    })
  })

  it('denies missing sessions and Valkey errors', async () => {
    vi.mocked(getRuntime).mockReturnValue({
      getSession: vi.fn(async () => null),
    } as never)
    await expect(
      handler(
        request('https://store.example.test', 'better-auth.session_token=x'),
      ),
    ).resolves.toMatchObject({
      policyDocument: { Statement: [{ Effect: 'Deny' }] },
    })
    vi.mocked(getRuntime).mockReturnValue({
      getSession: vi.fn(async () => {
        throw new Error('Valkey is unavailable')
      }),
    } as never)
    await expect(
      handler(
        request('https://store.example.test', 'better-auth.session_token=x'),
      ),
    ).resolves.toMatchObject({
      policyDocument: { Statement: [{ Effect: 'Deny' }] },
    })
  })
})
