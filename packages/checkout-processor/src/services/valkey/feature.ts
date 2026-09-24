import { Redis } from 'ioredis'

export function createValkeyClient(url: string): Redis {
  return new Redis(url, { lazyConnect: true })
}
