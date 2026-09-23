import express from 'express'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { validateRequest } from '#api/middleware/validate'

describe('validateRequest', () => {
  it('returns structured 400 issues and stops invalid requests', async () => {
    const app = express()
    app.use(express.json())
    app.post(
      '/example',
      validateRequest('body', z.object({ count: z.number().int().positive() })),
      (_request, response) => {
        response.json({ ok: true })
      },
    )

    const server = app.listen(0)
    const address = server.address()
    if (!address || typeof address === 'string')
      throw new Error('Expected a TCP address')
    try {
      const response = await fetch(`http://127.0.0.1:${address.port}/example`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ count: -1 }),
      })
      expect(response.status).toBe(400)
      expect(await response.json()).toMatchObject({
        error: 'Invalid request',
        issues: [{ path: ['count'] }],
      })
    } finally {
      server.close()
    }
  })
})
