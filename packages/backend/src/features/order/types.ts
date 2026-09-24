import type { z } from 'zod'
import type { orderInputSchema } from '#features/order/schema'

export type OrderInput = z.infer<typeof orderInputSchema>

export type OrderDocument = OrderInput & {
  createdAt?: Date
  updatedAt?: Date
}
