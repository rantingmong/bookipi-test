import {
  listingCollection,
  listingSlotCollection,
  listingSlotStates,
} from '#features/listing/constants'
import type {
  ListingDocument,
  ListingSlotDocument,
} from '#features/listing/types'
import type { Models } from '#types'
import { Schema, type Connection } from 'mongoose'

const listingSchema = new Schema<ListingDocument>(
  {
    listingId: { type: String, required: true, unique: true },
    productName: { type: String, required: true },
    saleStartsAt: { type: Date, required: true },
    saleEndsAt: { type: Date, required: true },
    reserveSlots: { type: Number, required: true },
  },
  { timestamps: true, versionKey: false },
)

const listingSlotSchema = new Schema<ListingSlotDocument>(
  {
    listingId: { type: String, required: true },
    slotId: { type: String, required: true },
    state: { type: String, enum: listingSlotStates, required: true },
    orderId: { type: String },
    customerId: { type: String },
  },
  { timestamps: true, versionKey: false },
)

listingSlotSchema.index({ listingId: 1, slotId: 1 }, { unique: true })
listingSlotSchema.index({ listingId: 1, state: 1 })

export function createListingModels(
  connection: Connection,
): Pick<Models, 'ListingModel' | 'ListingSlotModel'> {
  return {
    ListingModel: connection.model<ListingDocument>(
      'Listing',
      listingSchema,
      listingCollection,
    ),
    ListingSlotModel: connection.model<ListingSlotDocument>(
      'ListingSlot',
      listingSlotSchema,
      listingSlotCollection,
    ),
  }
}
