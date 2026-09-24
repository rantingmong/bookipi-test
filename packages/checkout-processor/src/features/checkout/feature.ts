import { randomUUID } from 'node:crypto'
import { checkoutInputSchema, type CheckoutInput } from './schema.js'
import type { CheckoutDependencies } from '#types'

export { checkoutInputSchema }

export type CheckoutResult =
  | { orderId: string; status: 'PENDING'; redirectUrl: string }
  | {
      status:
        | 'unpublished'
        | 'closed'
        | 'sold-out'
        | 'already-active'
        | 'cancelled'
        | 'unavailable'
    }

export async function startCheckout(
  input: unknown,
  customerId: string,
  dependencies: CheckoutDependencies,
): Promise<CheckoutResult> {
  const request: CheckoutInput = checkoutInputSchema.parse(input)
  const candidateOrderId = dependencies.createOrderId()
  const claim = await dependencies.claim({
    listingId: request.listingId,
    customerId,
    idempotencyKey: request.idempotencyKey,
    candidateOrderId,
  })

  if (claim.status !== 'reserved') return claim

  await dependencies.publish({
    eventType: 'order-reserved.v1',
    orderId: claim.orderId,
    customerId,
    listingId: request.listingId,
    slotId: claim.slotId,
  })
  const paymentSession = dependencies.startPaymentSession(claim.orderId)
  return {
    orderId: claim.orderId,
    status: 'PENDING',
    redirectUrl: paymentSession.redirectUrl,
  }
}

export function createCandidateOrderId(): string {
  return randomUUID()
}
