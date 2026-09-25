'use client'

import { usePageState } from '@/app/page.state'
import { HomePageProvider } from './context'
import { HeaderPart } from './parts/header'
import { NavigationPart } from './parts/navigation'
import { PurchasePart } from './parts/purchase'
import { SalePart } from './parts/sale'
import { SessionPart } from './parts/session'

export default function Content() {
  const state = usePageState()

  return (
    <HomePageProvider value={state}>
      <main
        className="group"
        data-listing={state.listingState}
        data-session={state.sessionState}
        data-purchase={state.purchaseState}
        data-checkout-configured={String(state.checkoutConfigured)}
      >
        <HeaderPart />
        <SalePart />
        <SessionPart />
        <PurchasePart />
        <NavigationPart />
      </main>
    </HomePageProvider>
  )
}
