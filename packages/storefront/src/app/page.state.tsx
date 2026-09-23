'use client'

import { useState } from 'react'
import useSWRMutation from 'swr/mutation'
import { checkSystemHealth } from '@/lib/features/system.client'

export function usePageState() {
  const [configurationError, setConfigurationError] = useState<string | null>(
    null,
  )
  const { data, error, isMutating, trigger } = useSWRMutation(
    'system-health',
    (_key, { arg }: { arg: string }) => checkSystemHealth(arg),
  )

  const status = (() => {
    if (configurationError) {
      return configurationError
    }
    if (error) {
      return 'The API request failed.'
    }
    if (data) {
      return 'API is ready.'
    }
    return 'API status has not been checked.'
  })()

  async function checkHealth() {
    const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL
    if (!baseUrl) {
      setConfigurationError('Set NEXT_PUBLIC_API_BASE_URL to check the API.')
      return
    }
    setConfigurationError(null)
    try {
      await trigger(baseUrl)
    } catch {
      // SWR exposes the fetch error through its hook state.
    }
  }

  return { status, loading: isMutating, checkHealth }
}
