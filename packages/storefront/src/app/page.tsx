'use client'

import { usePageState } from '@/app/page.state'
import Link from 'next/link'

export default function HomePage() {
  const { status, loading, checkHealth } = usePageState()
  const buttonLabel = (() => {
    if (loading) {
      return 'Checking…'
    }
    return 'Check API'
  })()

  return (
    <main>
      <h1>Bookipi Flash Sale</h1>
      <p>{status}</p>
      <button onClick={checkHealth} disabled={loading}>
        {buttonLabel}
      </button>
      <nav aria-label="Account">
        <Link href="/sign-up">Sign up</Link>
        {' · '}
        <Link href="/login">Log in</Link>
      </nav>
    </main>
  )
}
