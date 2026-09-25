import Link from 'next/link'
import { useHomePageContext } from '../context'

export function PurchasePart() {
  const state = useHomePageContext()

  return (
    <section aria-labelledby="purchase-heading">
      <h2 id="purchase-heading">Purchase</h2>
      <p
        className="hidden group-data-[checkout-configured=false]:block"
        role="alert"
      >
        Set NEXT_PUBLIC_CHECKOUT_URL to enable checkout.
      </p>
      <button
        type="button"
        onClick={state.purchase}
        disabled={
          !state.session.data ||
          state.purchasePending ||
          !state.checkoutConfigured ||
          state.listingState !== 'ready'
        }
      >
        <span className="hidden group-data-[purchase=pending]:inline">
          Sending request…
        </span>
        <span className="group-data-[purchase=pending]:hidden">
          Buy one unit
        </span>
      </button>
      <p className="hidden group-data-[purchase=accepted]:block" role="status">
        {state.purchaseMessage}
      </p>
      <p className="hidden group-data-[purchase=retryable]:block" role="alert">
        {state.purchaseMessage}
      </p>
      <p
        className="hidden group-data-[purchase=unauthenticated]:block"
        role="alert"
      >
        {state.purchaseMessage}{' '}
        <Link href="/login">Sign in and try again.</Link>
      </p>
      <p className="hidden group-data-[purchase=sold-out]:block" role="status">
        {state.purchaseMessage}
      </p>
      <p className="hidden group-data-[purchase=rejected]:block" role="alert">
        {state.purchaseMessage}
      </p>
      <p className="hidden group-data-[purchase=accepted]:block">
        <Link href={state.paymentRedirect}>Open payment page</Link>
      </p>
    </section>
  )
}
