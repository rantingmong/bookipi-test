import type { APIGatewayProxyEvent } from 'aws-lambda'
import { describe, expect, it, vi } from 'vitest'
import { authenticateCheckoutSession } from './feature.js'

function event(cookie?: string): APIGatewayProxyEvent {
  const headers: Record<string, string> = {}
  if (cookie) headers.Cookie = cookie
  return {
    headers,
  } as unknown as APIGatewayProxyEvent
}

describe('local checkout authentication', () => {
  it('does not read a session without a cookie', async () => {
    const readSession = vi.fn()

    await expect(
      authenticateCheckoutSession(event(), readSession),
    ).resolves.toBeUndefined()
    expect(readSession).not.toHaveBeenCalled()
  })

  it('returns no identity for an invalid session', async () => {
    const readSession = vi.fn().mockResolvedValue(null)

    const cookie = 'better-auth.session_token=invalid'
    await expect(
      authenticateCheckoutSession(event(cookie), readSession),
    ).resolves.toBeUndefined()
    expect(readSession).toHaveBeenCalledWith({
      headers: new Headers({ cookie }),
      query: { disableRefresh: true, disableCookieCache: true },
    })
  })

  it('returns only the customer id from a valid session', async () => {
    const readSession = vi.fn().mockResolvedValue({
      user: { id: 'verified-customer' },
    })

    await expect(
      authenticateCheckoutSession(
        event('better-auth.session_token=valid'),
        readSession,
      ),
    ).resolves.toBe('verified-customer')
  })

  it('propagates session storage errors for safe handler mapping', async () => {
    const readSession = vi.fn().mockRejectedValue(new Error('private detail'))

    await expect(
      authenticateCheckoutSession(
        event('better-auth.session_token=valid'),
        readSession,
      ),
    ).rejects.toThrow('private detail')
  })
})
