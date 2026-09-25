import {
  environmentSchema,
  localAdapterEnvironmentSchema,
  type Environment,
  type LocalAdapterEnvironment,
} from './schema.js'

export function parseEnvironment(source: NodeJS.ProcessEnv): Environment {
  return environmentSchema.parse({
    VALKEY_URL: source.VALKEY_URL,
    ORDER_EVENTS_QUEUE_URL: source.ORDER_EVENTS_QUEUE_URL,
    STOREFRONT_ORIGIN: source.STOREFRONT_ORIGIN,
  })
}

export function parseLocalAdapterEnvironment(
  source: NodeJS.ProcessEnv,
): LocalAdapterEnvironment {
  return localAdapterEnvironmentSchema.parse({
    VALKEY_URL: source.VALKEY_URL,
    ORDER_EVENTS_QUEUE_URL: source.ORDER_EVENTS_QUEUE_URL,
    STOREFRONT_ORIGIN: source.STOREFRONT_ORIGIN,
    BETTER_AUTH_URL: source.BETTER_AUTH_URL,
    BETTER_AUTH_SECRET: source.BETTER_AUTH_SECRET,
  })
}
