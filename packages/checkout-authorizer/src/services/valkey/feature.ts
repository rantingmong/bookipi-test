import { redisStorage } from '@better-auth/redis-storage'
import { Redis } from 'ioredis'

export const authSessionKeyPrefix = 'bookipi:auth:'

export function createValkeyService(url: string) {
  const client = new Redis(url, { lazyConnect: true })
  return {
    client,
    secondaryStorage: redisStorage({ client, keyPrefix: authSessionKeyPrefix }),
  }
}
