import { usePaymentPageContext } from '../context'

export function OutcomeControls() {
  const state = usePaymentPageContext()
  const disabled =
    state.isLoadingOutcome || state.viewState !== 'payment-pending'

  return (
    <section className="hidden group-data-[state=payment-pending]:block">
      <p>Choose a mock payment result.</p>
      <button onClick={state.applySuccess} disabled={disabled}>
        Payment succeeded
      </button>
      <button onClick={state.applyFailure} disabled={disabled}>
        Payment failed
      </button>
    </section>
  )
}
