import { betterAuth } from 'better-auth'
import { mongodbAdapter } from 'better-auth/adapters/mongodb'
import { fromNodeHeaders } from 'better-auth/node'
import type { BetterAuthOptions } from 'better-auth'
import type { Db, MongoClient } from 'mongodb'
import type { IncomingHttpHeaders } from 'node:http'
import type { AuthConfig } from '#features/env/feature'

export type AuthFeatureDependencies = {
  config: AuthConfig
  database: NonNullable<BetterAuthOptions['database']>
  secondaryStorage: NonNullable<BetterAuthOptions['secondaryStorage']>
}

export function createAuthFeatureOptions({
  config,
  database,
  secondaryStorage,
}: AuthFeatureDependencies): BetterAuthOptions {
  const trustedOrigins: string[] = []
  if (config.storefrontOrigin) {
    trustedOrigins.push(config.storefrontOrigin)
  }

  return {
    appName: 'Bookipi Flash Sale',
    baseURL: config.authUrl,
    basePath: '/api/auth',
    secret: config.authSecret,
    database,
    secondaryStorage,
    emailAndPassword: { enabled: true },
    session: { storeSessionInDatabase: false },
    trustedOrigins,
  }
}

export function createAuthFeature(dependencies: AuthFeatureDependencies) {
  return betterAuth(createAuthFeatureOptions(dependencies))
}

export function createMongoAuthAdapter(database: Db, client: MongoClient) {
  return mongodbAdapter(database, { client })
}

export async function resolveSessionIdentity(
  auth: {
    api: {
      getSession(input: {
        headers: Headers
      }): Promise<{ user: { id: string } } | null>
    }
  },
  headers: IncomingHttpHeaders,
) {
  const session = await auth.api.getSession({
    headers: fromNodeHeaders(headers),
  })
  if (!session) {
    return undefined
  }
  return { customerId: session.user.id }
}
