'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import useSWR from 'swr'
import useSWRMutation from 'swr/mutation'
import { authClient } from '@/lib/features/auth.client'
import {
  getOrderPollInterval,
  readOrder,
  submitMockPaymentOutcome,
} from '@/lib/features/order.client'
import type { MockPaymentOutcome } from '@/lib/features/order.client'
import {
  getCurrentCustomerOrder,
  getPaymentOrderKey,
  getPersistenceTimeoutKey,
  getPersistenceViewState,
  startPaymentPersistenceWait,
} from '@/lib/features/order-state'

const persistenceWaitMs = 15000

export function usePaymentPageState() {
  const searchParams = useSearchParams()
  const orderId = searchParams.get('orderId')
  const session = authClient.useSession()
  const customerId = session.data?.user.id
  const [timeoutState, setTimeoutState] = useState({
    key: null as string | null,
    timedOut: false,
  })
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL
  let orderKey: ReturnType<typeof getPaymentOrderKey> = null
  if (apiBaseUrl) {
    orderKey = getPaymentOrderKey(customerId, orderId)
  }
  const orderQuery = useSWR(
    orderKey,
    () => readOrder(apiBaseUrl as string, orderId as string),
    {
      refreshInterval: getOrderPollInterval,
      revalidateOnMount: true,
      shouldRetryOnError: true,
    },
  )
  const currentOrder = getCurrentCustomerOrder(
    orderQuery.data,
    customerId,
    orderQuery.isValidating,
    Boolean(orderQuery.error),
  )
  const timeoutKey = getPersistenceTimeoutKey(customerId, orderId)
  const persistenceViewState = getPersistenceViewState(timeoutState, timeoutKey)
  let outcomeKey: string[] | null = null
  if (orderId) {
    outcomeKey = ['mock-payment-outcome', orderId]
  }
  const outcomeMutation = useSWRMutation(
    outcomeKey,
    (_key, { arg }: { arg: MockPaymentOutcome }) => {
      if (!apiBaseUrl || !orderId) {
        throw new Error('The payment request is not configured.')
      }
      return submitMockPaymentOutcome(apiBaseUrl, orderId, arg)
    },
    { throwOnError: false },
  )

  useEffect(() => {
    return startPaymentPersistenceWait(
      timeoutKey,
      setTimeoutState,
      persistenceWaitMs,
      Boolean(currentOrder),
    )
  }, [currentOrder, timeoutKey])

  const viewState = (() => {
    let state = 'auth-loading'
    let hasRequestError = false
    if (session.error) {
      state = 'request-error'
      hasRequestError = true
    }
    if (!session.isPending && !session.data && !session.error) {
      state = 'unauthenticated'
    }
    if (customerId && !orderId) {
      state = 'not-found'
    }
    if (customerId && orderId && !currentOrder && !apiBaseUrl) {
      state = 'request-error'
    }
    if (session.data && orderId && orderQuery.error) {
      if (orderQuery.error.status !== 404) {
        state = 'request-error'
        hasRequestError = true
      }
    }
    if (
      customerId &&
      orderId &&
      !currentOrder &&
      persistenceViewState === 'pending' &&
      !hasRequestError
    ) {
      if (apiBaseUrl) {
        state = 'pending'
      }
    }
    if (
      customerId &&
      orderId &&
      !currentOrder &&
      persistenceViewState === 'not-found' &&
      !hasRequestError
    ) {
      state = 'not-found'
    }
    if (currentOrder?.status === 'PENDING') {
      state = 'payment-pending'
    }
    if (currentOrder?.status === 'COMPLETE') {
      state = 'complete'
    }
    if (currentOrder?.status === 'CANCELLED') {
      state = 'cancelled'
    }
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
    if (session.error) {
      message = 'The sign-in status request failed. Try again.'
    }
    if (outcomeMutation.error) {
      message = 'The payment result request failed. Try again.'
    }
    return message
  })()

  async function applyOutcome(outcome: 'success' | 'failure') {
    await outcomeMutation.trigger(outcome)
    await orderQuery.mutate()
  }

  return {
    applyFailure: () => applyOutcome('failure'),
    applySuccess: () => applyOutcome('success'),
    checkAgain: () => orderQuery.mutate(),
    errorMessage,
    isLoadingOutcome: outcomeMutation.isMutating,
    order: currentOrder,
    orderId,
    viewState,
  }
}

export type PaymentPageState = ReturnType<typeof usePaymentPageState>
