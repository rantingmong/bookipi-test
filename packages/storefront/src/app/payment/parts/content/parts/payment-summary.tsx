import { usePaymentPageContext } from '../context'

export function PaymentSummary() {
  const state = usePaymentPageContext()

  return (
    <>
      <p>Order: {state.orderId || 'Not provided'}</p>
      <p className="hidden group-data-[state=payment-pending]:block group-data-[state=complete]:block group-data-[state=cancelled]:block">
        Status: {state.order?.status}
      </p>
    </>
  )
}
