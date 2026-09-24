import { z } from 'zod'

export const listingInputSchema = z
  .object({
    listingId: z.string().min(1),
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
  listingId: z.string().min(1),
  additionalSlots: z.number().int().positive(),
})
