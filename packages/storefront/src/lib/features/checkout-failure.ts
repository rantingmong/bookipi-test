import { CheckoutRequestError } from './checkout.client'

export async function classifyCheckoutFailure(
  error: unknown,
  revalidateSession: () => Promise<boolean>,
) {
  if (error instanceof CheckoutRequestError) {
    if (error.status === 401 || error.code === 'UNAUTHENTICATED') {
      return new CheckoutRequestError('UNAUTHENTICATED', 401)
    }
    if (error.status !== 403 || error.hasExplicitCheckoutCode) {
      return error
    }
  }

  try {
    const sessionIsActive = await revalidateSession()
    if (!sessionIsActive) {
      return new CheckoutRequestError('UNAUTHENTICATED', 401)
    }
  } catch {
    // A failed session check does not prove that the session is absent.
  }

  return error
}
