import { environmentSchema, type Environment } from './schema.js'

export function parseEnvironment(source: NodeJS.ProcessEnv): Environment {
  return environmentSchema.parse({
    VALKEY_URL: source.VALKEY_URL,
    ORDER_EVENTS_QUEUE_URL: source.ORDER_EVENTS_QUEUE_URL,
    STOREFRONT_ORIGIN: source.STOREFRONT_ORIGIN,
  })
}
