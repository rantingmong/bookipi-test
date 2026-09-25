import { Suspense } from 'react'
import Content from '@/app/order-status/parts/content'

export default function OrderStatusPage() {
  return (
    <Suspense
      fallback={
        <main>
          <p>Loading order status…</p>
        </main>
      }
    >
      <Content />
    </Suspense>
  )
}
