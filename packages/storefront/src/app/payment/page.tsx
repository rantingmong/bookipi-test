import { Suspense } from 'react'
import Content from '@/app/payment/parts/content'

export default function PaymentPage() {
  return (
    <Suspense
      fallback={
        <main>
          <p>Loading payment…</p>
        </main>
      }
    >
      <Content />
    </Suspense>
  )
}
