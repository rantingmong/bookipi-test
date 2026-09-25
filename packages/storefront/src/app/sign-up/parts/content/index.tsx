'use client'

import { useSignUpPageState } from '@/app/sign-up/page.state'
import { SignUpPageProvider } from './context'
import { SignUpFeedback } from './parts/sign-up-feedback'
import { SignUpForm } from './parts/sign-up-form'
import { SignUpNavigation } from './parts/sign-up-navigation'
import { SignUpSession } from './parts/sign-up-session'
import { SignUpTitle } from './parts/sign-up-title'

export default function Content() {
  const state = useSignUpPageState()

  return (
    <SignUpPageProvider value={state}>
      <main
        className="group"
        data-form-submitting={String(state.formState.isSubmitting)}
        data-feedback={state.feedbackState}
        data-session={state.sessionState}
      >
        <SignUpTitle />
        <SignUpForm />
        <SignUpFeedback />
        <SignUpNavigation />
        <SignUpSession />
      </main>
    </SignUpPageProvider>
  )
}
