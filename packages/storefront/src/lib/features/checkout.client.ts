export type CheckoutResponse = {
  orderId: string
  status: 'PENDING'
  redirectUrl: string
}

export const checkoutErrorCodes = [
  'UNAUTHENTICATED',
  'INVALID_REQUEST',
  'LISTING_UNPUBLISHED',
  'SALE_CLOSED',
  'SOLD_OUT',
  'ACTIVE_ORDER_EXISTS',
  'RESERVATION_CANCELLED',
  'CHECKOUT_RETRYABLE',
] as const

type CheckoutErrorCode = (typeof checkoutErrorCodes)[number]

function isCheckoutErrorCode(value: string): value is CheckoutErrorCode {
  return checkoutErrorCodes.includes(value as CheckoutErrorCode)
}

export class CheckoutRequestError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    public readonly hasExplicitCheckoutCode = false,
  ) {
    super(code)
    this.name = 'CheckoutRequestError'
  }
}

export async function submitCheckout(
  checkoutUrl: string,
  listingId: string,
  idempotencyKey: string,
): Promise<CheckoutResponse> {
  const response = await fetch(normalizeCheckoutUrl(checkoutUrl), {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ listingId, idempotencyKey }),
  })
  let body: unknown
  try {
    body = await response.json()
  } catch {
    body = null
  }
  if (!response.ok) {
    if (response.status === 401) {
      throw new CheckoutRequestError('UNAUTHENTICATED', response.status)
    }
    let code = 'CHECKOUT_RETRYABLE'
    let hasExplicitCheckoutCode = false
    if (
      typeof body === 'object' &&
      body !== null &&
      'error' in body &&
      typeof body.error === 'string' &&
      isCheckoutErrorCode(body.error)
    ) {
      code = body.error
      hasExplicitCheckoutCode = true
    }
    throw new CheckoutRequestError(
      code,
      response.status,
      hasExplicitCheckoutCode,
    )
  }
  if (
    typeof body !== 'object' ||
    body === null ||
    !('orderId' in body) ||
    typeof body.orderId !== 'string' ||
    !('status' in body) ||
    body.status !== 'PENDING' ||
    !('redirectUrl' in body) ||
    typeof body.redirectUrl !== 'string' ||
    !body.redirectUrl.startsWith('/') ||
    body.redirectUrl.startsWith('//') ||
    body.redirectUrl.includes('\\')
  ) {
    throw new CheckoutRequestError('CHECKOUT_RETRYABLE', response.status)
  }
  return {
    orderId: body.orderId,
    status: body.status,
    redirectUrl: body.redirectUrl,
  }
}

export function normalizeCheckoutUrl(checkoutUrl: string) {
  return checkoutUrl.replace(/\/+$/, '')
}
