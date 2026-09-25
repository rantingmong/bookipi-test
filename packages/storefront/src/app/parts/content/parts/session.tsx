import { useHomePageContext } from '../context'
import Link from 'next/link'

export function SessionPart() {
  const state = useHomePageContext()

  return (
    <section aria-labelledby="session-heading">
      <h2 id="session-heading">Current session</h2>
      <p className="hidden group-data-[session=loading]:block">
        Checking session…
      </p>
      <p className="hidden group-data-[session=authenticated]:block">
        Signed in as {state.session.data?.user.name} (
        {state.session.data?.user.email})
      </p>
      <button
        type="button"
        className="hidden group-data-[session=authenticated]:inline"
        onClick={state.leaveSession}
        disabled={state.signOutPending}
      >
        Sign out
      </button>
      <p className="hidden group-data-[customer-order=ordered]:block">
        You have already ordered this sale. Order {state.customerOrder?.orderId}{' '}
        ({state.customerOrder?.status}).{' '}
        <Link href={state.customerOrderLink}>View order</Link>
      </p>
      <p className="hidden group-data-[customer-order=loading]:block">
        Checking your order for this sale…
      </p>
      <p
        className="hidden group-data-[customer-order=error]:block"
        role="alert"
      >
        We could not check your order for this sale.
      </p>
      <p className="hidden group-data-[sign-out=pending]:block">Signing out…</p>
      <p
        className="hidden group-data-[session=authenticated]:block"
        role="alert"
      >
        {state.signOutError}
      </p>
      <p className="hidden group-data-[session=anonymous]:block">
        You are not signed in.
      </p>
      <p className="hidden group-data-[session=error]:block" role="alert">
        The sign-in status request failed.
      </p>
    </section>
  )
}
