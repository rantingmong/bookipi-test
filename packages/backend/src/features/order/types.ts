import type { orderInputSchema } from '#features/order/schema'
import type { z } from 'zod'

export type OrderInput = z.infer<typeof orderInputSchema>

export type OrderDocument = OrderInput & {
  releaseStatus?: 'PENDING' | 'COMPLETE'
  createdAt?: Date
  updatedAt?: Date
}

export type ReservationFacts = Omit<OrderInput, 'status'>
