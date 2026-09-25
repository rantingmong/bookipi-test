'use client'

import { createContext, useContext } from 'react'
import type { SignUpPageState } from '@/app/sign-up/page.state'

const SignUpPageContext = createContext<SignUpPageState | null>(null)

export const SignUpPageProvider = SignUpPageContext.Provider

export function useSignUpPageContext() {
  const state = useContext(SignUpPageContext)
  if (!state) throw new Error('Sign-up page context is not available')
  return state
}
