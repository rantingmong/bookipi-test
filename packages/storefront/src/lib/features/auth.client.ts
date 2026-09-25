import { createAuthClient } from 'better-auth/react'

export function createAuthClientOptions(apiBaseUrl?: string) {
  return {
    baseURL: apiBaseUrl?.replace(/\/$/, '') || undefined,
    fetchOptions: { credentials: 'include' as const },
  }
}

export const authClient = createAuthClient(
  createAuthClientOptions(process.env.NEXT_PUBLIC_API_BASE_URL),
)

export async function revalidateCurrentSession() {
  const sessionAtom = authClient.$store.atoms.session
  await sessionAtom.get().refetch()
  return Boolean(sessionAtom.get().data)
}

export function signUp(name: string, email: string, password: string) {
  return authClient.signUp.email({ name, email, password })
}

export function signIn(email: string, password: string) {
  return authClient.signIn.email({ email, password })
}

export function signOut() {
  return authClient.signOut()
}
