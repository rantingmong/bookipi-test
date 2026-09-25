import { environmentSchema } from './schema.js'

export function parseEnvironment(source: NodeJS.ProcessEnv) {
  return environmentSchema.parse({
    BETTER_AUTH_URL: source.BETTER_AUTH_URL,
    BETTER_AUTH_SECRET: source.BETTER_AUTH_SECRET,
    STOREFRONT_ORIGIN: source.STOREFRONT_ORIGIN,
    VALKEY_URL: source.VALKEY_URL,
  })
}
