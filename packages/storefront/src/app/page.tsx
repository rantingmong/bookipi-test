'use client'

import { usePageState } from '@/app/page.state'

export default function HomePage() {
  const { status, loading, checkHealth } = usePageState()
  return (
    <main>
      <h1>Bookipi Flash Sale</h1>
      <p>{status}</p>
      <button onClick={checkHealth} disabled={loading}>
        {loading ? 'Checking…' : 'Check API'}
      </button>
    </main>
  )
}
