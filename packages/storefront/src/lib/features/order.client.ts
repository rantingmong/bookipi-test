import {
  getCurrentOrder,
  getOrder,
  postPaymentOutcome,
} from '@/lib/api/generated/client'
import { ApiError } from '@/lib/api/generated/client'
import type { Order } from '@/lib/api/generated/models'

export type MockPaymentOutcome = 'success' | 'failure' | 'expired'

function createRequestConfig(baseUrl: string) {
  return {
    baseUrl: baseUrl.replace(/\/$/, ''),
    onRequest: ({ init }: { init: RequestInit }) => ({
      init: { ...init, credentials: 'include' as const },
    }),
  }
}

export async function readOrder(baseUrl: string, orderId: string) {
  try {
    return await getOrder(orderId, createRequestConfig(baseUrl))
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return null
    }
    throw error
  }
}

export async function readCurrentOrder(baseUrl: string, listingId: string) {
  try {
    return await getCurrentOrder({ listingId }, createRequestConfig(baseUrl))
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return null
    }
    throw error
  }
}

export async function submitMockPaymentOutcome(
  baseUrl: string,
  orderId: string,
  outcome: MockPaymentOutcome,
) {
  return postPaymentOutcome(orderId, { outcome }, createRequestConfig(baseUrl))
}

export function getOrderPollInterval(order: Order | null | undefined) {
  if (order) {
    return 0
  }
  return 1000
}
