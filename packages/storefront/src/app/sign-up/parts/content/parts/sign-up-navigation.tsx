import Link from 'next/link'

export function SignUpNavigation() {
  return (
    <>
      <p>
        Already have an account? <Link href="/login">Log in</Link>
      </p>
      <p>
        <Link href="/">Back to API status</Link>
      </p>
    </>
  )
}
