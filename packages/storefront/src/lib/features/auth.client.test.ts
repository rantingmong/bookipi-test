import { beforeEach, describe, expect, it, vi } from 'vitest'

const { signUpEmail, signInEmail, signOut, createAuthClient, sessionAtom } =
  vi.hoisted(() => {
    const signUpEmail = vi.fn()
    const signInEmail = vi.fn()
    const signOut = vi.fn()
    const sessionAtom = { get: vi.fn() }
    const createAuthClient = vi.fn(() => ({
      signUp: { email: signUpEmail },
      signIn: { email: signInEmail },
      signOut,
      $store: { atoms: { session: sessionAtom } },
    }))
    return { signUpEmail, signInEmail, signOut, createAuthClient, sessionAtom }
  })

vi.mock('better-auth/react', () => ({ createAuthClient }))

import {
  createAuthClientOptions,
  signIn as signInUser,
  signOut as signOutUser,
  signUp,
  revalidateCurrentSession,
} from './auth.client.js'

describe('auth client', () => {
  beforeEach(() => {
    signUpEmail.mockClear()
    signInEmail.mockClear()
    signOut.mockClear()
    sessionAtom.get.mockReset()
  })

  it('normalizes the API origin and includes browser credentials', () => {
    expect(createAuthClient).toHaveBeenCalledWith(
      expect.objectContaining({
        fetchOptions: { credentials: 'include' },
      }),
    )
    expect(createAuthClientOptions('https://api.example.test/')).toEqual({
      baseURL: 'https://api.example.test',
      fetchOptions: { credentials: 'include' },
    })
    expect(createAuthClientOptions()).toEqual({
      baseURL: undefined,
      fetchOptions: { credentials: 'include' },
    })
  })

  it('sends name, email, and password for sign-up', async () => {
    await signUp('Sam Customer', 'sam@example.test', 'password123')

    expect(signUpEmail).toHaveBeenCalledWith({
      name: 'Sam Customer',
      email: 'sam@example.test',
      password: 'password123',
    })
  })

  it('sends email and password for sign-in and sign-out', async () => {
    await signInUser('sam@example.test', 'password123')
    await signOutUser()

    expect(signInEmail).toHaveBeenCalledWith({
      email: 'sam@example.test',
      password: 'password123',
    })
    expect(signOut).toHaveBeenCalledOnce()
  })

  it('revalidates the Better Auth session and returns its current state', async () => {
    const refetch = vi.fn().mockResolvedValue(undefined)
    let sessionData: { user: { id: string } } | null = {
      user: { id: 'customer-1' },
    }
    sessionAtom.get.mockImplementation(() => ({
      refetch,
      data: sessionData,
    }))

    await expect(revalidateCurrentSession()).resolves.toBe(true)
    expect(refetch).toHaveBeenCalledOnce()

    sessionData = null
    await expect(revalidateCurrentSession()).resolves.toBe(false)
    expect(refetch).toHaveBeenCalledTimes(2)
  })
})
