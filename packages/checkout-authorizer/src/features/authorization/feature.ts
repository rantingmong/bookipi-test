type Session = { user: { id: string } } | null

type SessionReader = (input: {
  headers: Headers
  query: { disableRefresh: true; disableCookieCache: true }
}) => Promise<Session>

function isExactOrigin(value: string | undefined) {
  if (!value) return false
  try {
    const parsed = new URL(value)
    return (
      ['http:', 'https:'].includes(parsed.protocol) && parsed.origin === value
    )
  } catch {
    return false
  }
}

export async function authorizeCheckoutRequest(input: {
  origin?: string
  configuredOrigin?: string
  cookie?: string
  headers: Headers
  readSession: SessionReader
}): Promise<string | undefined> {
  if (
    !isExactOrigin(input.origin) ||
    !isExactOrigin(input.configuredOrigin) ||
    input.origin !== input.configuredOrigin
  ) {
    return undefined
  }
  if (!input.cookie) return undefined

  try {
    const session = await input.readSession({
      headers: input.headers,
      query: { disableRefresh: true, disableCookieCache: true },
    })
    const customerId = session?.user.id
    if (!customerId) return undefined
    return customerId
  } catch {
    return undefined
  }
}
