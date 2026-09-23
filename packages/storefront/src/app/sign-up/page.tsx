'use client'

import Link from 'next/link'
import { useSignUpPageState } from './page.state'

export default function SignUpPage() {
  const { formState, register, submit, ...state } = useSignUpPageState()

  return (
    <main
      className="group"
      data-form-submitting={String(formState.isSubmitting)}
      data-feedback={state.feedbackState}
      data-session={state.sessionState}
    >
      <h1>Create an account</h1>
      <p>Use your email address and a password to sign up.</p>
      <form onSubmit={submit}>
        <label htmlFor="sign-up-name">Name</label>
        <input
          id="sign-up-name"
          autoComplete="name"
          required
          {...register('name')}
        />
        <label htmlFor="sign-up-email">Email</label>
        <input
          id="sign-up-email"
          type="email"
          autoComplete="email"
          required
          {...register('email')}
        />
        <label htmlFor="sign-up-password">Password</label>
        <input
          id="sign-up-password"
          type="password"
          autoComplete="new-password"
          required
          {...register('password')}
        />
        <button
          type="submit"
          disabled={formState.isSubmitting || state.authActionPending}
        >
          <span className="hidden group-data-[form-submitting=true]:inline">
            Creating account…
          </span>
          <span className="group-data-[form-submitting=true]:hidden">
            Sign up
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
        Already have an account? <Link href="/login">Log in</Link>
      </p>
      <p>
        <Link href="/">Back to API status</Link>
      </p>
      <section aria-labelledby="sign-up-session-heading">
        <h2 id="sign-up-session-heading">Current session</h2>
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
