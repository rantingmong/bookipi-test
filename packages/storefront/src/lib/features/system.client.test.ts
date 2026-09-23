import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/api/generated/client', () => ({ getSystemHealth: vi.fn() }))

import { getSystemHealth } from '@/lib/api/generated/client'
import { checkSystemHealth } from './system.client'

describe('checkSystemHealth', () => {
  beforeEach(() => vi.clearAllMocks())

  it('passes the normalized API origin to the generated route client', async () => {
    vi.mocked(getSystemHealth).mockResolvedValue({ status: 'ok' })

    await checkSystemHealth('https://api.example.test/')

    expect(getSystemHealth).toHaveBeenCalledWith({ baseUrl: 'https://api.example.test' })
  })
})
