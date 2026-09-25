import Link from 'next/link'
import { usePaymentPageContext } from '../context'

export function PaymentNotices() {
  const state = usePaymentPageContext()

  return (
    <>
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
        <p>{state.errorMessage}</p>
        <button onClick={state.checkAgain}>Try again</button>
      </section>
      <p className="hidden group-data-[state=complete]:block">
        Payment complete.
      </p>
      <p className="hidden group-data-[state=cancelled]:block">
        Payment cancelled.
      </p>
      <p aria-live="polite">{state.errorMessage}</p>
    </>
  )
}
