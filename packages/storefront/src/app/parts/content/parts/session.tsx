import { useHomePageContext } from '../context'

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
      <p className="hidden group-data-[session=anonymous]:block">
        You are not signed in.
      </p>
      <p className="hidden group-data-[session=error]:block" role="alert">
        The sign-in status request failed.
      </p>
    </section>
  )
}
