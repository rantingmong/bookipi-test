import { betterAuth } from 'better-auth'
import { parseEnvironment } from './features/env/feature.js'
import { createValkeyService } from './services/valkey/feature.js'

type SessionReader = {
  getSession: (input: {
    headers: Headers
    query: { disableRefresh: true; disableCookieCache: true }
  }) => Promise<{ user: { id: string } } | null>
}

let runtime: { getSession: SessionReader['getSession'] } | undefined

export function getRuntime() {
  if (runtime) return runtime

  const environment = parseEnvironment(process.env)
  const valkey = createValkeyService(environment.VALKEY_URL)
  const auth = betterAuth({
    appName: 'Bookipi Flash Sale',
    baseURL: environment.BETTER_AUTH_URL,
    secret: environment.BETTER_AUTH_SECRET,
    secondaryStorage: valkey.secondaryStorage,
    session: { storeSessionInDatabase: false },
  })
  runtime = {
    getSession: (input) => auth.api.getSession(input),
  }
  return runtime
}
