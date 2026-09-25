import { useHomePageContext } from '../context'

export function SalePart() {
  const state = useHomePageContext()

  return (
    <section aria-labelledby="sale-heading">
      <h2 id="sale-heading">Sale</h2>
      <p className="hidden group-data-[listing=loading]:block">
        Loading sale details…
      </p>
      <p
        className="hidden group-data-[listing=configuration-error]:block"
        role="alert"
      >
        {state.configurationMessage}
      </p>
      <p className="hidden group-data-[listing=error]:block" role="alert">
        {state.listingErrorMessage}
      </p>
      <div className="hidden group-data-[listing=ready]:block">
        <p>{state.listing?.productName}</p>
        <p>Sale opens: {state.listing?.saleStartsAt}</p>
        <p>Sale closes: {state.listing?.saleEndsAt}</p>
        <p>Total units: {state.listing?.stockTotal}</p>
        <p>Reserved units: {state.listing?.reserveSlots}</p>
        <p>Public units: {state.listing?.publicStock}</p>
      </div>
    </section>
  )
}
