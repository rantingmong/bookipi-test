'use client'

import { createContext, useContext } from 'react'
import type { HomePageState } from '@/app/page.state'

const HomePageContext = createContext<HomePageState | null>(null)

export const HomePageProvider = HomePageContext.Provider

export function useHomePageContext() {
  const state = useContext(HomePageContext)
  if (!state) throw new Error('Home page context is not available')
  return state
}
