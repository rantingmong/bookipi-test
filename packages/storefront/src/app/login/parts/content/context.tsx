'use client'

import { createContext, useContext } from 'react'
import type { LoginPageState } from '@/app/login/page.state'

const LoginPageContext = createContext<LoginPageState | null>(null)

export const LoginPageProvider = LoginPageContext.Provider

export function useLoginPageContext() {
  const state = useContext(LoginPageContext)
  if (!state) throw new Error('Login page context is not available')
  return state
}
