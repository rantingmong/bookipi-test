import { z } from 'zod'

const listingIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/)

export const listingInputSchema = z
  .object({
    listingId: listingIdSchema,
    productName: z.string().min(1),
    saleStartsAt: z.coerce.date(),
    saleEndsAt: z.coerce.date(),
    reserveSlots: z.number().int().nonnegative(),
    initialSlotCount: z.number().int().positive(),
  })
  .strict()
  .refine((listing) => listing.reserveSlots <= listing.initialSlotCount, {
    path: ['initialSlotCount'],
    message: 'initialSlotCount must be at least reserveSlots',
  })
  .refine((listing) => listing.saleEndsAt > listing.saleStartsAt, {
    path: ['saleEndsAt'],
    message: 'saleEndsAt must follow saleStartsAt',
  })

export const addListingSlotsInputSchema = z.object({
  listingId: listingIdSchema,
  additionalSlots: z.number().int().positive(),
})
