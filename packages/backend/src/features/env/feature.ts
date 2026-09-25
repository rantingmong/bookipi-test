import {
  authEnvSchema,
  listingSeedOverridesSchema,
  listingSeedEnvSchema,
  mongoEnvSchema,
  orderWorkerEnvSchema,
} from '#features/env/schema'
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

export function readEnvConfig(
  environment: Environment = process.env,
): AuthConfig {
  const config = authEnvSchema.parse(environment)

  return {
    authUrl: config.BETTER_AUTH_URL,
    authSecret: config.BETTER_AUTH_SECRET,
    mongoUri: config.MONGODB_URI,
    mongoDatabase: config.MONGODB_DATABASE,
    valkeyUrl: config.VALKEY_URL,
    storefrontOrigin: config.STOREFRONT_ORIGIN,
  }
}

export function readMongoEnvConfig(
  environment: Environment = process.env,
): MongoServiceConfig {
  const config = mongoEnvSchema.parse(environment)
  return {
    mongoUri: config.MONGODB_URI,
    mongoDatabase: config.MONGODB_DATABASE,
  }
}

export function readListingSeedEnvConfig(
  environment: Environment = process.env,
) {
  const config = listingSeedEnvSchema.parse(environment)
  return {
    mongoUri: config.MONGODB_URI,
    mongoDatabase: config.MONGODB_DATABASE,
    valkeyUrl: config.VALKEY_URL,
  }
}

export function readOrderWorkerEnvConfig(
  environment: Environment = process.env,
) {
  const config = orderWorkerEnvSchema.parse(environment)
  return {
    mongoUri: config.MONGODB_URI,
    mongoDatabase: config.MONGODB_DATABASE,
    awsRegion: config.AWS_REGION,
    sqsQueueUrl: config.SQS_QUEUE_URL,
    sqsEndpointUrl: config.SQS_ENDPOINT_URL,
  }
}

export function readListingSeedOverrides(
  environment: Environment = process.env,
) {
  const config = listingSeedOverridesSchema.parse(environment)
  return {
    listingId: config.DEMO_LISTING_ID,
    saleStartsAt: config.DEMO_SALE_STARTS_AT,
    saleEndsAt: config.DEMO_SALE_ENDS_AT,
  }
}
