import Link from 'next/link'

export function LoginNavigation() {
  return (
    <>
      <p>
        Need an account? <Link href="/sign-up">Sign up</Link>
      </p>
      <p>
        <Link href="/">Back to API status</Link>
      </p>
    </>
  )
}
