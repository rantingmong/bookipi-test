import { z } from 'zod'

const listingIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/)

export const orderReservedEventSchema = z
  .object({
    eventType: z.literal('order-reserved.v1'),
    orderId: z.string().uuid(),
    customerId: z.string().min(1),
    listingId: listingIdSchema,
    slotId: z.string().min(1),
  })
  .strict()
