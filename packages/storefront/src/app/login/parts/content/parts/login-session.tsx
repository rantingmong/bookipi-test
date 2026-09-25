import { useLoginPageContext } from '../context'

export function LoginSession() {
  const state = useLoginPageContext()

  return (
    <section aria-labelledby="login-session-heading">
      <h2 id="login-session-heading">Current session</h2>
      <p className="hidden group-data-[session=loading]:block">
        Checking session…
      </p>
      <div className="hidden group-data-[session=authenticated]:block">
        <p>
          Signed in as {state.session?.user.name} ({state.session?.user.email})
        </p>
        <button
          type="button"
          onClick={state.leaveSession}
          disabled={state.formState.isSubmitting || state.authActionPending}
        >
          Sign out
        </button>
      </div>
      <p className="hidden group-data-[session=anonymous]:block">
        You are not signed in.
      </p>
      <p className="hidden group-data-[session=error]:block" role="alert">
        We could not check your session.
      </p>
    </section>
  )
}
