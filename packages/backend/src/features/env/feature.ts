import { mongoServiceConfigSchema } from '#services/mongodb/schema'
import type { MongoServiceConfig } from '#services/mongodb/types'

export type AuthConfig = {
  authUrl: string
  authSecret: string
  mongoUri: string
  mongoDatabase: string
  valkeyUrl: string
  storefrontOrigin?: string
}

type Environment = Record<string, string | undefined>

function required(environment: Environment, key: string): string {
  const value = environment[key]?.trim()
  if (!value) throw new Error(`Missing required environment variable ${key}`)
  return value
}

export function readEnvConfig(
  environment: Environment = process.env,
): AuthConfig {
  const authUrl = required(environment, 'BETTER_AUTH_URL')
  try {
    const parsedUrl = new URL(authUrl)
    if (
      !['http:', 'https:'].includes(parsedUrl.protocol) ||
      parsedUrl.origin !== authUrl
    )
      throw new Error()
  } catch {
    throw new Error(
      'BETTER_AUTH_URL must be an HTTP or HTTPS origin without a path',
    )
  }

  const storefrontOrigin = environment.STOREFRONT_ORIGIN?.trim() || undefined
  if (storefrontOrigin) {
    try {
      const parsedOrigin = new URL(storefrontOrigin)
      if (parsedOrigin.origin !== storefrontOrigin) throw new Error()
    } catch {
      throw new Error(
        'STOREFRONT_ORIGIN must be an exact origin without a path',
      )
    }
  }

  return {
    authUrl,
    authSecret: required(environment, 'BETTER_AUTH_SECRET'),
    mongoUri: required(environment, 'MONGODB_URI'),
    mongoDatabase: required(environment, 'MONGODB_DATABASE'),
    valkeyUrl: required(environment, 'VALKEY_URL'),
    storefrontOrigin,
  }
}

export function readMongoEnvConfig(
  environment: Environment = process.env,
): MongoServiceConfig {
  return mongoServiceConfigSchema.parse({
    mongoUri: environment.MONGODB_URI,
    mongoDatabase: environment.MONGODB_DATABASE,
  })
}

export function readListingSeedEnvConfig(
  environment: Environment = process.env,
) {
  return {
    ...readMongoEnvConfig(environment),
    valkeyUrl: required(environment, 'VALKEY_URL'),
  }
}
