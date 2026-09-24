import type {
  ListingDocument,
  ListingSlotDocument,
} from '#features/listing/types'
import type { OrderDocument } from '#features/order/types'
import type { Redis } from 'ioredis'
import type { Connection, Model } from 'mongoose'

export type Models = {
  ListingModel: Model<ListingDocument>
  ListingSlotModel: Model<ListingSlotDocument>
  OrdersModel: Model<OrderDocument>
}

export type StorageDependencies = Models & {
  mongoConnection: Pick<Connection, 'startSession'>
  valkeyConnection: Redis
}
