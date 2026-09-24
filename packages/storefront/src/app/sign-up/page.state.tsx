'use client'

import { useRef } from 'react'
import { useForm } from 'react-hook-form'
import useSWRMutation from 'swr/mutation'
import { authClient, signOut, signUp } from '@/lib/features/auth.client'

type SignUpFormValues = {
  name: string
  email: string
  password: string
}

export function useSignUpPageState() {
  const { register, handleSubmit, formState } = useForm<SignUpFormValues>()
  const actionInProgress = useRef(false)
  const session = authClient.useSession()
  const signUpMutation = useSWRMutation(
    'auth-sign-up',
    async (_key, { arg }: { arg: SignUpFormValues }) => {
      let result
      try {
        result = await signUp(arg.name, arg.email, arg.password)
      } catch {
        throw new Error('The sign-up request failed.')
      }
      if (result.error) {
        if (result.error.message) {
          throw new Error(result.error.message)
        }
        throw new Error('The sign-up request failed.')
      }
      void session.refetch()
      return true
    },
    { throwOnError: false },
  )
  const signOutMutation = useSWRMutation(
    'auth-sign-out',
    async () => {
      let result
      try {
        result = await signOut()
      } catch {
        throw new Error('The sign-out request failed.')
      }
      if (result.error) {
        if (result.error.message) {
          throw new Error(result.error.message)
        }
        throw new Error('The sign-out request failed.')
      }
      void session.refetch()
      return true
    },
    { throwOnError: false },
  )

  async function onSubmit(values: SignUpFormValues) {
    if (actionInProgress.current) {
      return
    }
    actionInProgress.current = true
    signOutMutation.reset()
    signUpMutation.reset()
    try {
      await signUpMutation.trigger(values)
    } finally {
      actionInProgress.current = false
    }
  }

  async function leaveSession() {
    if (actionInProgress.current) {
      return
    }
    actionInProgress.current = true
    signUpMutation.reset()
    signOutMutation.reset()
    try {
      await signOutMutation.trigger()
    } finally {
      actionInProgress.current = false
    }
  }

  const error = (() => {
    if (signUpMutation.error) {
      return signUpMutation.error.message
    }
    if (signOutMutation.error) {
      return signOutMutation.error.message
    }
    return null
  })()
  const message = (() => {
    if (error) {
      return null
    }
    if (signOutMutation.data) {
      return 'The sign-out request succeeded.'
    }
    if (signUpMutation.data) {
      return 'Your account is ready.'
    }
    return null
  })()
  const feedbackState = (() => {
    if (error) {
      return 'error'
    }
    if (message) {
      return 'success'
    }
    return 'none'
  })()
  const sessionState = (() => {
    if (session.error) {
      return 'error'
    }
    if (session.isPending) {
      return 'loading'
    }
    if (session.data) {
      return 'authenticated'
    }
    return 'anonymous'
  })()

  return {
    register,
    submit: handleSubmit(onSubmit),
    formState,
    message,
    error,
    feedbackState,
    sessionState,
    authActionPending: signUpMutation.isMutating || signOutMutation.isMutating,
    leaveSession,
    session: session.data,
  }
}
