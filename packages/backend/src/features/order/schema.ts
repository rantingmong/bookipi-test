import { orderStatuses } from '#features/order/constants'
import { z } from 'zod'

export const orderInputSchema = z
  .object({
    orderId: z.string().min(1),
    customerId: z.string().min(1),
    listingId: z.string().min(1),
    slotId: z.string().min(1),
    status: z.enum(orderStatuses),
  })
  .strict()

export const orderIdSchema = z.object({ orderId: z.string().min(1) }).strict()

export const listingOrderQuerySchema = z
  .object({
    listingId: z
      .string()
      .min(1)
      .max(128)
      .regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/),
  })
  .strict()
