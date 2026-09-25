'use client'

import { usePaymentPageState } from '@/app/payment/page.state'
import { PaymentPageProvider } from './context'
import { OutcomeControls } from './parts/outcome-controls'
import { PaymentNotices } from './parts/payment-notices'
import { PaymentSummary } from './parts/payment-summary'
import { PaymentTitle } from './parts/payment-title'

export default function Content() {
  const state = usePaymentPageState()

  return (
    <PaymentPageProvider value={state}>
      <main className="group" data-state={state.viewState}>
        <PaymentTitle />
        <PaymentSummary />
        <PaymentNotices />
        <OutcomeControls />
      </main>
    </PaymentPageProvider>
  )
}
