import { describe, expect, it, vi } from 'vitest'
import { createLoadTestSessions } from '#features/load-test/feature'

describe('load-test feature', () => {
  it('creates users and returns their session cookies without exposing credentials', async () => {
    const signUpEmail = vi.fn(async () => {
      const headers = new Headers()
      headers.append(
        'set-cookie',
        'better-auth.session_token=session-secret; Path=/; HttpOnly',
      )
      return new Response(JSON.stringify({ user: { id: 'customer-1' } }), {
        headers,
      })
    })
    const createId = vi
      .fn()
      .mockReturnValueOnce('user-id-1')
      .mockReturnValueOnce('password-1')

    const sessions = await createLoadTestSessions(
      { api: { signUpEmail } },
      1,
      createId,
    )

    expect(sessions.map((session) => session.userId)).toEqual(['customer-1'])
    expect(sessions[0]?.cookie.startsWith('better-auth.session_token=')).toBe(
      true,
    )
    expect(sessions[0]?.cookie.includes('session-secret')).toBe(true)
    expect(signUpEmail).toHaveBeenCalledWith({
      body: {
        email: 'k6-user-id-1@load-test.invalid',
        name: 'k6-user-id-1',
        password: 'password-1',
      },
      asResponse: true,
    })
    expect(JSON.stringify(sessions).includes('password-1')).toBe(false)
  })

  it('rejects a count that is not a positive safe integer', async () => {
    const signUpEmail = vi.fn()

    await expect(
      createLoadTestSessions({ api: { signUpEmail } }, 0),
    ).rejects.toThrow('Session count must be a positive safe integer.')
    expect(signUpEmail).not.toHaveBeenCalled()
  })

  it('creates the requested number of users with unique email addresses', async () => {
    const emails: string[] = []
    const signUpEmail = vi.fn(
      async (input: {
        body: { email: string; name: string; password: string }
        asResponse: true
      }) => {
        emails.push(input.body.email)
        const headers = new Headers({
          'set-cookie': 'better-auth.session_token=secret; Path=/; HttpOnly',
        })
        return new Response(JSON.stringify({ user: { id: 'customer-1' } }), {
          headers,
        })
      },
    )
    const createId = vi
      .fn()
      .mockReturnValueOnce('user-id-1')
      .mockReturnValueOnce('password-1')
      .mockReturnValueOnce('user-id-2')
      .mockReturnValueOnce('password-2')

    const sessions = await createLoadTestSessions(
      { api: { signUpEmail } },
      2,
      createId,
    )
    expect(sessions).toHaveLength(2)
    expect(emails).toEqual([
      'k6-user-id-1@load-test.invalid',
      'k6-user-id-2@load-test.invalid',
    ])
  })

  it('rejects a response without a session cookie without printing cookie data', async () => {
    const signUpEmail = vi.fn(
      async () => new Response(JSON.stringify({ user: { id: 'customer-1' } })),
    )

    await expect(
      createLoadTestSessions({ api: { signUpEmail } }, 1),
    ).rejects.toThrow('Better Auth did not return a user session cookie.')
  })
})
