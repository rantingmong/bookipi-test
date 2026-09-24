import { z } from 'zod'
import { orderStatuses } from '#features/order/constants'

export const orderInputSchema = z
  .object({
    orderId: z.string().min(1),
    customerId: z.string().min(1),
    listingId: z.string().min(1),
    slotId: z.string().min(1),
    status: z.enum(orderStatuses),
  })
  .strict()
