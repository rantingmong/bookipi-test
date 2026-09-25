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
        <p className="hidden group-data-[sale-window=checking]:block">
          Checking sale status…
        </p>
        <p className="hidden group-data-[sale-window=upcoming]:block">
          The sale has not started.
        </p>
        <p className="hidden group-data-[sale-window=open]:block">
          The sale has started.
        </p>
        <p className="hidden group-data-[sale-window=ended]:block">
          The sale has ended.
        </p>
        <p>Sale opens: {state.listing?.saleStartsAt}</p>
        <p>Sale closes: {state.listing?.saleEndsAt}</p>
        <p>Units available: {state.listing?.remainingUnits}</p>
        <p>Units bought: {state.listing?.boughtUnits}</p>
      </div>
    </section>
  )
}
