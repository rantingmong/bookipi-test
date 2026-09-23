import { getSystemHealth } from '@/lib/api/generated/client'

export async function checkSystemHealth(baseUrl: string) {
  return getSystemHealth({ baseUrl: baseUrl.replace(/\/$/, '') })
}
