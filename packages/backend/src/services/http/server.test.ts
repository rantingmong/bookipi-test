import type { Express } from 'express'
import { EventEmitter } from 'node:events'
import type { Server } from 'node:http'
import { describe, expect, it, vi } from 'vitest'
import { listenHttpServer } from '#services/http/server'

describe('HTTP server listener', () => {
  it('rejects a bind error before worker startup', async () => {
    const server = new EventEmitter() as Server
    const app = {
      listen: vi.fn(() => server),
    } as unknown as Express
    const startWorker = vi.fn()
    const bindError = Object.assign(new Error('Address already in use'), {
      code: 'EADDRINUSE',
    })
    const startup = listenHttpServer(app, 3001).then(startWorker)

    server.emit('error', bindError)

    await expect(startup).rejects.toBe(bindError)
    expect(startWorker).not.toHaveBeenCalled()
    expect(server.listenerCount('listening')).toBe(0)
    expect(server.listenerCount('error')).toBe(0)
  })

  it('resolves after the server starts listening', async () => {
    const server = new EventEmitter() as Server
    const app = {
      listen: vi.fn(() => server),
    } as unknown as Express
    const startWorker = vi.fn()
    const startup = listenHttpServer(app, 3001).then(startWorker)

    server.emit('listening')

    await expect(startup).resolves.toBeUndefined()
    expect(startWorker).toHaveBeenCalledOnce()
    expect(server.listenerCount('listening')).toBe(0)
    expect(server.listenerCount('error')).toBe(0)
  })
})
