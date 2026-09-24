import type { orderInputSchema } from '#features/order/schema'
import type { z } from 'zod'

export type OrderInput = z.infer<typeof orderInputSchema>

export type OrderDocument = OrderInput & {
  createdAt?: Date
  updatedAt?: Date
}
