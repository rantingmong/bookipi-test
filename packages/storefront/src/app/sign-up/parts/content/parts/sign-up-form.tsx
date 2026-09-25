import { useSignUpPageContext } from '../context'

export function SignUpForm() {
  const state = useSignUpPageContext()

  return (
    <form onSubmit={state.submit}>
      <label htmlFor="sign-up-name">Name</label>
      <input
        id="sign-up-name"
        autoComplete="name"
        required
        {...state.register('name')}
      />
      <label htmlFor="sign-up-email">Email</label>
      <input
        id="sign-up-email"
        type="email"
        autoComplete="email"
        required
        {...state.register('email')}
      />
      <label htmlFor="sign-up-password">Password</label>
      <input
        id="sign-up-password"
        type="password"
        autoComplete="new-password"
        required
        {...state.register('password')}
      />
      <button
        type="submit"
        disabled={state.formState.isSubmitting || state.authActionPending}
      >
        <span className="hidden group-data-[form-submitting=true]:inline">
          Creating account…
        </span>
        <span className="group-data-[form-submitting=true]:hidden">
          Sign up
        </span>
      </button>
    </form>
  )
}
