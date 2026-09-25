'use client'

import { createContext, useContext } from 'react'
import type { PaymentPageState } from '@/app/payment/page.state'

const PaymentPageContext = createContext<PaymentPageState | null>(null)

export const PaymentPageProvider = PaymentPageContext.Provider

export function usePaymentPageContext() {
  const state = useContext(PaymentPageContext)
  if (!state) throw new Error('Payment page context is not available')
  return state
}
