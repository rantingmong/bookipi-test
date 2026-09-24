import { orderReservedEventSchema } from '../checkout/schema.js'

export type PaymentSession = {
  redirectUrl: string
}

export function startPaymentSession(orderId: string): PaymentSession {
  const parsedOrderId = orderReservedEventSchema.shape.orderId.parse(orderId)
  return {
    redirectUrl: `/payment?orderId=${encodeURIComponent(parsedOrderId)}`,
  }
}
