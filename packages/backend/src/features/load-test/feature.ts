import { randomUUID } from 'node:crypto'

type LoadTestAuth = {
  api: {
    signUpEmail(input: {
      body: { email: string; name: string; password: string }
      asResponse: true
    }): Promise<Response>
  }
}

export type LoadTestSession = {
  userId: string
  cookie: string
}

export async function createLoadTestSessions(
  auth: LoadTestAuth,
  count: number,
  createId: () => string = randomUUID,
): Promise<LoadTestSession[]> {
  if (!Number.isSafeInteger(count) || count < 1) {
    throw new Error('Session count must be a positive safe integer.')
  }

  const sessions: LoadTestSession[] = []
  for (let index = 0; index < count; index += 1) {
    const userSuffix = createId()
    const response = await auth.api.signUpEmail({
      body: {
        email: `k6-${userSuffix}@load-test.invalid`,
        name: `k6-${userSuffix}`,
        password: createId(),
      },
      asResponse: true,
    })

    if (!response.ok) {
      throw new Error('Better Auth could not create a load-test user.')
    }

    const body: unknown = await response.json().catch(() => undefined)
    if (!isUserResponse(body)) {
      throw new Error('Better Auth did not return a load-test user ID.')
    }

    const cookie = response.headers
      .getSetCookie()
      .map((setCookie) => setCookie.split(';', 1)[0])
      .filter((value): value is string => Boolean(value))
      .join('; ')

    if (!cookie) {
      throw new Error('Better Auth did not return a user session cookie.')
    }

    sessions.push({ userId: body.user.id, cookie })
  }

  return sessions
}

function isUserResponse(value: unknown): value is { user: { id: string } } {
  if (!value || typeof value !== 'object') return false
  if (!('user' in value) || !value.user || typeof value.user !== 'object') {
    return false
  }
  if (!('id' in value.user)) return false
  return typeof value.user.id === 'string' && value.user.id.length > 0
}
