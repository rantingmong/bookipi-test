import type { Order } from '@/lib/api/generated/models'

export type PaymentPersistenceTimeoutState = {
  key: string | null
  timedOut: boolean
}

export function getPaymentOrderKey(
  customerId: string | undefined,
  orderId: string | null,
) {
  if (!customerId || !orderId) {
    return null
  }
  return ['payment-order', customerId, orderId] as const
}

export function getPersistenceTimeoutKey(
  customerId: string | undefined,
  orderId: string | null,
) {
  if (!customerId || !orderId) {
    return null
  }
  return JSON.stringify([customerId, orderId])
}

export function getPersistenceViewState(
  timeoutState: PaymentPersistenceTimeoutState,
  currentKey: string | null,
) {
  if (currentKey && timeoutState.key === currentKey && timeoutState.timedOut) {
    return 'not-found'
  }
  return 'pending'
}

export function startPaymentPersistenceWait(
  key: string | null,
  setTimeoutState: (state: PaymentPersistenceTimeoutState) => void,
  waitMs: number,
  hasOrder: boolean,
) {
  setTimeoutState({ key, timedOut: false })
  if (!key || hasOrder) {
    return () => {}
  }
  const timer = setTimeout(
    () => setTimeoutState({ key, timedOut: true }),
    waitMs,
  )
  return () => clearTimeout(timer)
}

export function getCurrentCustomerOrder(
  order: Order | null | undefined,
  customerId: string | undefined,
  isValidating: boolean,
  hasError: boolean,
) {
  if (!order || !customerId || order.customerId !== customerId) {
    return undefined
  }
  if (isValidating || hasError) {
    return undefined
  }
  return order
}
