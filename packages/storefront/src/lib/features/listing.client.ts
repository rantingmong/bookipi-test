import { getListingStatus } from '@/lib/api/generated/client'

function requestConfig(baseUrl: string) {
  return {
    baseUrl: baseUrl.replace(/\/+$/, ''),
    onRequest: ({ init }: { init: RequestInit }) => ({
      init: { ...init, credentials: 'include' as const },
    }),
  }
}

export function readListingStatus(baseUrl: string, listingId: string) {
  return getListingStatus(listingId, requestConfig(baseUrl))
}
