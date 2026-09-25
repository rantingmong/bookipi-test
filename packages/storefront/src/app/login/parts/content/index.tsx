'use client'

import { useLoginPageState } from '@/app/login/page.state'
import { LoginPageProvider } from './context'
import { LoginFeedback } from './parts/login-feedback'
import { LoginForm } from './parts/login-form'
import { LoginNavigation } from './parts/login-navigation'
import { LoginSession } from './parts/login-session'
import { LoginTitle } from './parts/login-title'

export default function Content() {
  const state = useLoginPageState()

  return (
    <LoginPageProvider value={state}>
      <main
        className="group"
        data-form-submitting={String(state.formState.isSubmitting)}
        data-feedback={state.feedbackState}
        data-session={state.sessionState}
      >
        <LoginTitle />
        <LoginForm />
        <LoginFeedback />
        <LoginNavigation />
        <LoginSession />
      </main>
    </LoginPageProvider>
  )
}
