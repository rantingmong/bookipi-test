'use client'

import Link from 'next/link'
import { useOrderStatusPageState } from '@/app/order-status/page.state'

export default function Content() {
  const state = useOrderStatusPageState()

  return (
    <main className="group" data-state={state.viewState}>
      <h1>Order status</h1>
      <p>Order: {state.orderId || 'Not provided'}</p>
      <p className="hidden group-data-[state=payment-pending]:block group-data-[state=complete]:block group-data-[state=cancelled]:block">
        Status: {state.order?.status}
      </p>
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
        <button onClick={state.checkAgain}>Check again</button>
      </section>
      <section className="hidden group-data-[state=request-error]:block">
        <button onClick={state.checkAgain}>Try again</button>
      </section>
      <p className="hidden group-data-[state=complete]:block">
        Payment complete.
      </p>
      <p className="hidden group-data-[state=cancelled]:block">
        Payment cancelled.
      </p>
      <p aria-live="polite">{state.errorMessage}</p>
      <Link href="/">Return to sale</Link>
    </main>
  )
}
