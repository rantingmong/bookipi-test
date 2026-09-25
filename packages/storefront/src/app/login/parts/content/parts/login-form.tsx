import { useLoginPageContext } from '../context'

export function LoginForm() {
  const state = useLoginPageContext()

  return (
    <form onSubmit={state.submit}>
      <label htmlFor="login-email">Email</label>
      <input
        id="login-email"
        type="email"
        autoComplete="email"
        required
        {...state.register('email')}
      />
      <label htmlFor="login-password">Password</label>
      <input
        id="login-password"
        type="password"
        autoComplete="current-password"
        required
        {...state.register('password')}
      />
      <button
        type="submit"
        disabled={state.formState.isSubmitting || state.authActionPending}
      >
        <span className="hidden group-data-[form-submitting=true]:inline">
          Logging in…
        </span>
        <span className="group-data-[form-submitting=true]:hidden">Log in</span>
      </button>
    </form>
  )
}
