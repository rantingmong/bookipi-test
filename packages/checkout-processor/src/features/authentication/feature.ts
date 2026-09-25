import type { APIGatewayProxyEvent } from 'aws-lambda'
import { authHeader, eventHeader } from '../labmda/feature.js'

type AuthSession = { user: { id: string } } | null
type SessionReader = (input: {
  headers: Headers
  query: { disableRefresh: true; disableCookieCache: true }
}) => Promise<AuthSession>

export async function authenticateCheckoutSession(
  event: APIGatewayProxyEvent,
  readSession: SessionReader,
): Promise<string | undefined> {
  const cookie = eventHeader(event, 'cookie')
  if (!cookie) return undefined

  const session = await readSession({
    headers: authHeader(event),
    query: { disableRefresh: true, disableCookieCache: true },
  })
  const customerId = session?.user.id
  if (typeof customerId !== 'string' || customerId.trim().length === 0) {
    return undefined
  }
  return customerId
}
