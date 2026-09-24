'use client'

import Link from 'next/link'
import { usePaymentPageState } from '@/app/payment/page.state'

export default function PaymentContent() {
  const {
    applyFailure,
    applySuccess,
    checkAgain,
    errorMessage,
    isLoadingOutcome,
    mockPaymentEnabled,
    order,
    orderId,
    viewState,
  } = usePaymentPageState()
  const disabled = isLoadingOutcome || viewState !== 'payment-pending'

  return (
    <main
      className="group"
      data-state={viewState}
      data-mock-enabled={mockPaymentEnabled}
    >
      <h1>Mock payment</h1>
      <p>Order: {orderId || 'Not provided'}</p>
      <p className="hidden group-data-[state=auth-loading]:block">
        Checking your sign-in status…
      </p>
      <section className="hidden group-data-[state=unauthenticated]:block">
        <p>Sign in to view this order.</p>
        <Link href="/login">Log in</Link>
      </section>
      <p className="hidden group-data-[state=pending]:block">
        Waiting for the order to reach the payment service…
      </p>
      <section className="hidden group-data-[state=not-found]:block">
        <p>This order was not found for your account.</p>
        <button onClick={checkAgain}>Check again</button>
      </section>
      <section className="hidden group-data-[state=request-error]:block">
        <p>{errorMessage}</p>
        <button onClick={checkAgain}>Try again</button>
      </section>
      <section className="hidden group-data-[state=payment-pending]:block">
        <p>Choose a mock payment result.</p>
        <div className="hidden group-data-[mock-enabled=true]:block">
          <button onClick={applySuccess} disabled={disabled}>
            Payment succeeded
          </button>
          <button onClick={applyFailure} disabled={disabled}>
            Payment failed
          </button>
        </div>
        <p className="hidden group-data-[mock-enabled=false]:block">
          Mock payment is not enabled for this storefront build.
        </p>
      </section>
      <p className="hidden group-data-[state=complete]:block">
        Payment complete.
      </p>
      <p className="hidden group-data-[state=cancelled]:block">
        Payment cancelled.
      </p>
      <p aria-live="polite">{errorMessage}</p>
      <p className="hidden group-data-[state=payment-pending]:block group-data-[state=complete]:block group-data-[state=cancelled]:block">
        Status: {order?.status}
      </p>
    </main>
  )
}
