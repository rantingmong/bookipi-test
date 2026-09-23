'use client'

import Link from 'next/link'
import { useLoginPageState } from './page.state'

export default function LoginPage() {
  const { formState, register, submit, ...state } = useLoginPageState()

  return (
    <main
      className="group"
      data-form-submitting={String(formState.isSubmitting)}
      data-feedback={state.feedbackState}
      data-session={state.sessionState}
    >
      <h1>Log in</h1>
      <p>Use the email address and password for your account.</p>
      <form onSubmit={submit}>
        <label htmlFor="login-email">Email</label>
        <input
          id="login-email"
          type="email"
          autoComplete="email"
          required
          {...register('email')}
        />
        <label htmlFor="login-password">Password</label>
        <input
          id="login-password"
          type="password"
          autoComplete="current-password"
          required
          {...register('password')}
        />
        <button
          type="submit"
          disabled={formState.isSubmitting || state.authActionPending}
        >
          <span className="hidden group-data-[form-submitting=true]:inline">
            Logging in…
          </span>
          <span className="group-data-[form-submitting=true]:hidden">
            Log in
          </span>
        </button>
      </form>
      <p className="hidden group-data-[feedback=success]:block" role="status">
        {state.message}
      </p>
      <p className="hidden group-data-[feedback=error]:block" role="alert">
        {state.error}
      </p>
      <p>
        Need an account? <Link href="/sign-up">Sign up</Link>
      </p>
      <p>
        <Link href="/">Back to API status</Link>
      </p>
      <section aria-labelledby="login-session-heading">
        <h2 id="login-session-heading">Current session</h2>
        <p className="hidden group-data-[session=loading]:block">
          Checking session…
        </p>
        <div className="hidden group-data-[session=authenticated]:block">
          <p>
            Signed in as {state.session?.user.name} ({state.session?.user.email}
            )
          </p>
          <button
            type="button"
            onClick={state.leaveSession}
            disabled={formState.isSubmitting || state.authActionPending}
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
    </main>
  )
}
