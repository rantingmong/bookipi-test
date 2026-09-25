import Link from 'next/link'
import { useHomePageContext } from '../context'

export function NavigationPart() {
  const state = useHomePageContext()

  return (
    <nav aria-label="Account and result">
      <Link href="/sign-up">Sign up</Link>
      {' · '}
      <Link href="/login">Log in</Link>
      {' · '}
      <Link
        className="hidden group-data-[purchase=accepted]:inline"
        href={state.paymentRedirect}
      >
        Purchase result
      </Link>
    </nav>
  )
}
