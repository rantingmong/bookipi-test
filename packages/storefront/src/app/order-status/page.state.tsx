'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import useSWR from 'swr'
import { authClient } from '@/lib/features/auth.client'
import { getOrderPollInterval, readOrder } from '@/lib/features/order.client'
import {
  getCurrentCustomerOrder,
  getPaymentOrderKey,
  getPersistenceTimeoutKey,
  getPersistenceViewState,
  startPaymentPersistenceWait,
} from '@/lib/features/order-state'

const persistenceWaitMs = 15000

export function useOrderStatusPageState() {
  const searchParams = useSearchParams()
  const orderId = searchParams.get('orderId')
  const session = authClient.useSession()
  const customerId = session.data?.user.id
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL
  const [timeoutState, setTimeoutState] = useState({
    key: null as string | null,
    timedOut: false,
  })
  let orderKey: ReturnType<typeof getPaymentOrderKey> = null
  if (apiBaseUrl) orderKey = getPaymentOrderKey(customerId, orderId)
  const orderQuery = useSWR(
    orderKey,
    () => readOrder(apiBaseUrl as string, orderId as string),
    {
      refreshInterval: getOrderPollInterval,
      revalidateOnMount: true,
      shouldRetryOnError: true,
    },
  )
  const order = getCurrentCustomerOrder(
    orderQuery.data,
    customerId,
    orderQuery.isValidating,
    Boolean(orderQuery.error),
  )
  const timeoutKey = getPersistenceTimeoutKey(customerId, orderId)
  const persistenceViewState = getPersistenceViewState(timeoutState, timeoutKey)

  useEffect(() => {
    return startPaymentPersistenceWait(
      timeoutKey,
      setTimeoutState,
      persistenceWaitMs,
      Boolean(order),
    )
  }, [order, timeoutKey])

  const viewState = (() => {
    let state = 'auth-loading'
    if (session.error) state = 'request-error'
    if (!session.isPending && !session.data && !session.error) {
      state = 'unauthenticated'
    }
    if (customerId && !orderId) state = 'not-found'
    if (customerId && orderId && !order && !apiBaseUrl) state = 'request-error'
    if (session.data && orderId && orderQuery.error) {
      if (orderQuery.error.status !== 404) state = 'request-error'
    }
    if (
      customerId &&
      orderId &&
      !order &&
      persistenceViewState === 'pending' &&
      !orderQuery.error
    ) {
      if (apiBaseUrl) state = 'pending'
    }
    if (
      customerId &&
      orderId &&
      !order &&
      persistenceViewState === 'not-found' &&
      !orderQuery.error
    ) {
      state = 'not-found'
    }
    if (order?.status === 'PENDING') state = 'payment-pending'
    if (order?.status === 'COMPLETE') state = 'complete'
    if (order?.status === 'CANCELLED') state = 'cancelled'
    return state
  })()
  const errorMessage = (() => {
    let message = ''
    if (customerId && orderId && !apiBaseUrl) {
      message = 'Set NEXT_PUBLIC_API_BASE_URL to check the API.'
    }
    if (orderQuery.error && orderQuery.error.status !== 404) {
      message = 'The order request failed. Try again.'
    }
    if (session.error) message = 'The sign-in status request failed. Try again.'
    return message
  })()

  return {
    checkAgain: () => orderQuery.mutate(),
    errorMessage,
    order,
    orderId,
    viewState,
  }
}
