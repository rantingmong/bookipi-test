import type { listingInputSchema } from '#features/listing/schema'
import type { z } from 'zod'

export type ListingInput = z.infer<typeof listingInputSchema>
export type ListingDocumentInput = Omit<ListingInput, 'initialSlotCount'>
export type ListingSlotState = 'available' | 'reserved' | 'secured'

export type ListingDocument = ListingDocumentInput & {
  createdAt?: Date
  updatedAt?: Date
}

export type ListingSlotDocument = {
  listingId: string
  slotId: string
  state: ListingSlotState
  orderId?: string
  customerId?: string
  createdAt?: Date
  updatedAt?: Date
}
