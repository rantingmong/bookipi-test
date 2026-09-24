import { beforeEach, describe, expect, it, vi } from 'vitest'

const { redisClient, createRedis, redisStorage } = vi.hoisted(() => {
  const redisClient = { connect: vi.fn(), quit: vi.fn() }
  return {
    redisClient,
    createRedis: vi.fn(() => redisClient),
    redisStorage: vi.fn(() => ({
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
    })),
  }
})

vi.mock('ioredis', () => ({ Redis: createRedis }))
vi.mock('@better-auth/redis-storage', () => ({ redisStorage }))

import {
  authSessionKeyPrefix,
  createValkeyService,
} from '#services/valkey/client'

describe('Valkey auth client', () => {
  beforeEach(() => vi.clearAllMocks())

  it('creates a lazy Redis connection with a separate Better Auth key prefix', () => {
    const service = createValkeyService('redis://localhost:6379')

    expect(createRedis).toHaveBeenCalledWith('redis://localhost:6379', {
      lazyConnect: true,
    })
    expect(redisStorage).toHaveBeenCalledWith({
      client: redisClient,
      keyPrefix: authSessionKeyPrefix,
    })
    expect(service.client).toBe(redisClient)
    expect(service.secondaryStorage).toBeDefined()
  })
})
