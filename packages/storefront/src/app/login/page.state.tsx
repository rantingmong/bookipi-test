'use client'

import { useRef } from 'react'
import { useForm } from 'react-hook-form'
import useSWRMutation from 'swr/mutation'
import { authClient, signIn, signOut } from '@/lib/features/auth.client'

type LoginFormValues = {
  email: string
  password: string
}

export function useLoginPageState() {
  const { register, handleSubmit, formState } = useForm<LoginFormValues>()
  const actionInProgress = useRef(false)
  const session = authClient.useSession()
  const signInMutation = useSWRMutation(
    'auth-sign-in',
    async (_key, { arg }: { arg: LoginFormValues }) => {
      let result
      try {
        result = await signIn(arg.email, arg.password)
      } catch {
        throw new Error('The login request failed.')
      }
      if (result.error) {
        if (result.error.message) {
          throw new Error(result.error.message)
        }
        throw new Error('The login request failed.')
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

  async function onSubmit(values: LoginFormValues) {
    if (actionInProgress.current) {
      return
    }
    actionInProgress.current = true
    signOutMutation.reset()
    signInMutation.reset()
    try {
      await signInMutation.trigger(values)
    } finally {
      actionInProgress.current = false
    }
  }

  async function leaveSession() {
    if (actionInProgress.current) {
      return
    }
    actionInProgress.current = true
    signInMutation.reset()
    signOutMutation.reset()
    try {
      await signOutMutation.trigger()
    } finally {
      actionInProgress.current = false
    }
  }

  const error = (() => {
    if (signInMutation.error) {
      return signInMutation.error.message
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
    if (signInMutation.data) {
      return 'The login request succeeded.'
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
    authActionPending: signInMutation.isMutating || signOutMutation.isMutating,
    leaveSession,
    session: session.data,
  }
}
