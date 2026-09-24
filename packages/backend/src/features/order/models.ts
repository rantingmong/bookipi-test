import {
  activeOrderStatuses,
  orderCollection,
  orderStatuses,
} from '#features/order/constants'
import type { OrderDocument } from '#features/order/types'
import type { Models } from '#types'
import { Schema, type Connection } from 'mongoose'

const orderSchema = new Schema<OrderDocument>(
  {
    orderId: { type: String, required: true },
    customerId: { type: String, required: true },
    listingId: { type: String, required: true },
    slotId: { type: String, required: true },
    status: { type: String, enum: orderStatuses, required: true },
  },
  { timestamps: true, versionKey: false },
)

orderSchema.index({ orderId: 1 }, { unique: true })
orderSchema.index(
  { listingId: 1, customerId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      $and: [
        { listingId: { $exists: true } },
        { customerId: { $exists: true } },
        { status: { $in: activeOrderStatuses } },
      ],
    },
  },
)
orderSchema.index(
  { listingId: 1, slotId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      $and: [
        { listingId: { $exists: true } },
        { slotId: { $exists: true } },
        { status: { $in: activeOrderStatuses } },
      ],
    },
  },
)

export function createOrderModel(
  connection: Connection,
): Pick<Models, 'OrdersModel'> {
  return {
    OrdersModel: connection.model<OrderDocument>(
      'Order',
      orderSchema,
      orderCollection,
    ),
  }
}
