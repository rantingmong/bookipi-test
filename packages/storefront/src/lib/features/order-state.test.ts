import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  getCurrentCustomerOrder,
  getPaymentOrderKey,
  getPersistenceViewState,
  startPaymentPersistenceWait,
} from './order-state'
import type { PaymentPersistenceTimeoutState } from './order-state'

const order = {
  orderId: 'order-001',
  customerId: 'customer-001',
  listingId: 'listing-001',
  slotId: 'listing-001:slot:0001',
  status: 'PENDING' as const,
  createdAt: '2026-09-24T00:00:00.000Z',
  updatedAt: '2026-09-24T00:00:00.000Z',
}

describe('payment order state', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('scopes the cache key to both the customer and order', () => {
    expect(getPaymentOrderKey('customer-001', 'order-001')).toEqual([
      'payment-order',
      'customer-001',
      'order-001',
    ])
    expect(getPaymentOrderKey('customer-002', 'order-001')).not.toEqual(
      getPaymentOrderKey('customer-001', 'order-001'),
    )
  })

  it('requires a fresh non-error response for the current owner', () => {
    expect(
      getCurrentCustomerOrder(order, 'customer-001', false, false),
    ).toEqual(order)
    expect(
      getCurrentCustomerOrder(order, 'customer-002', false, false),
    ).toBeUndefined()
    expect(
      getCurrentCustomerOrder(order, 'customer-001', true, false),
    ).toBeUndefined()
    expect(
      getCurrentCustomerOrder(order, 'customer-001', false, true),
    ).toBeUndefined()
  })

  it('starts a full pending wait when navigation changes the order key', () => {
    vi.useFakeTimers()
    const oldKey = JSON.stringify(['customer-001', 'order-001'])
    const newKey = JSON.stringify(['customer-001', 'order-002'])
    let timeoutState: PaymentPersistenceTimeoutState = {
      key: oldKey,
      timedOut: true,
    }

    startPaymentPersistenceWait(
      newKey,
      (nextState) => {
        timeoutState = nextState
      },
      15000,
      false,
    )

    expect(getPersistenceViewState(timeoutState, newKey)).toBe('pending')
    vi.advanceTimersByTime(14999)
    expect(getPersistenceViewState(timeoutState, newKey)).toBe('pending')
    vi.advanceTimersByTime(1)
    expect(getPersistenceViewState(timeoutState, newKey)).toBe('not-found')
  })
})
