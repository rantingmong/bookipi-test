import {
  addListingSlotsInputSchema,
  listingInputSchema,
} from '#features/listing/schema'
import type { Models, StorageDependencies } from '#types'
import type { Redis } from 'ioredis'

export { listingInputSchema }

const seedListingScript = `
if redis.call('EXISTS', KEYS[1]) == 1 or redis.call('EXISTS', KEYS[2]) == 1 then
  return -1
end
local slotCount = #ARGV - 4
if slotCount < 1 then
  return -2
end
for index = 1, slotCount do
  redis.call('RPUSH', KEYS[2], ARGV[index + 4])
end
redis.call('HSET', KEYS[1],
  'saleStartsAt', ARGV[1],
  'saleEndsAt', ARGV[2],
  'reserveSlots', ARGV[3],
  'seedVersion', ARGV[4],
  'seedCount', slotCount,
  'published', '0'
)
return slotCount
`

const publishListingScript = `
local expectedCount = tonumber(ARGV[1])
if redis.call('LLEN', KEYS[2]) ~= expectedCount then
  return 0
end
if tonumber(redis.call('HGET', KEYS[1], 'seedCount') or '0') ~= expectedCount then
  return 0
end
redis.call('HSET', KEYS[1], 'published', '1')
return 1
`

const releaseCancelledSlotScript = `
local orderId = ARGV[1]
local listingId = ARGV[2]
local rawCustomerId = ARGV[3]
local activeCustomerField = ARGV[4]
local slotId = ARGV[5]
local orderStatus = ARGV[6]
if redis.call('HGET', KEYS[1], 'published') ~= '1' then
  return 0
end
if orderStatus ~= 'CANCELLED' then
  return 0
end
if redis.call('EXISTS', KEYS[4]) == 1 then
  if redis.call('HGET', KEYS[4], 'orderId') == orderId and
    redis.call('HGET', KEYS[4], 'listingId') == listingId and
    redis.call('HGET', KEYS[4], 'customerId') == rawCustomerId and
    redis.call('HGET', KEYS[4], 'slotId') == slotId then
    return 1
  end
  return 0
end
local orderPrefix = orderId .. ':'
if redis.call('HGET', KEYS[3], orderPrefix .. 'orderId') ~= orderId then
  return 0
end
if redis.call('HGET', KEYS[3], orderPrefix .. 'listingId') ~= listingId then
  return 0
end
if redis.call('HGET', KEYS[3], orderPrefix .. 'customerId') ~= rawCustomerId then
  return 0
end
if redis.call('HGET', KEYS[3], orderPrefix .. 'slotId') ~= slotId then
  return 0
end
if redis.call('HGET', KEYS[3], orderPrefix .. 'status') ~= 'PENDING' then
  return 0
end
if redis.call('HGET', KEYS[5], activeCustomerField) ~= orderId then
  return 0
end
redis.call('HSET', KEYS[3], orderPrefix .. 'status', 'CANCELLED')
redis.call('RPUSH', KEYS[2], slotId)
redis.call('HSET', KEYS[4],
  'orderId', orderId,
  'listingId', listingId,
  'customerId', rawCustomerId,
  'slotId', slotId
)
redis.call('HDEL', KEYS[5], activeCustomerField)
return 1
`

export async function createListing(
  input: unknown,
  dependencies: StorageDependencies,
) {
  const parsed = listingInputSchema.parse(input)
  const { initialSlotCount, ...listing } = parsed
  const session = await dependencies.mongoConnection.startSession()
  const slots = Array.from({ length: initialSlotCount }, (_unused, index) => ({
    listingId: listing.listingId,
    slotId: `${listing.listingId}:slot:${String(index + 1).padStart(4, '0')}`,
    state: 'available' as const,
  }))

  try {
    await session.withTransaction(async () => {
      await dependencies.ListingModel.create([listing], { session })
      await dependencies.ListingSlotModel.insertMany(slots, { session })
    })
  } finally {
    await session.endSession()
  }

  await seedListingInventory(dependencies.valkeyConnection, { listing, slots })

  return {
    ...listing,
    stockTotal: initialSlotCount,
    publicStock: initialSlotCount - listing.reserveSlots,
    slots,
  }
}

export async function getListingCounts(
  listingId: string,
  reserveSlots: number,
  models: Models,
) {
  const stockTotal = await models.ListingSlotModel.countDocuments({ listingId })
  return {
    stockTotal,
    reserveSlots,
    publicStock: stockTotal - reserveSlots,
  }
}

export async function getListingStatus(listingId: string, models: Models) {
  const listing = await models.ListingModel.findOne({ listingId })
  if (!listing) return null
  const counts = await getListingCounts(listingId, listing.reserveSlots, models)
  return {
    listingId: listing.listingId,
    productName: listing.productName,
    saleStartsAt: listing.saleStartsAt.toISOString(),
    saleEndsAt: listing.saleEndsAt.toISOString(),
    ...counts,
  }
}

export async function addListingSlots(
  input: unknown,
  dependencies: StorageDependencies,
) {
  const request = addListingSlotsInputSchema.parse(input)
  const session = await dependencies.mongoConnection.startSession()
  let result:
    | {
        listing: Record<string, unknown>
        stockTotal: number
        reserveSlots: number
        publicStock: number
        slots: Array<{ listingId: string; slotId: string; state: 'available' }>
      }
    | undefined

  try {
    await session.withTransaction(async () => {
      const listingQuery = dependencies.ListingModel.findOne({
        listingId: request.listingId,
      })
      const listing = await listingQuery.session(session)
      if (!listing)
        throw new Error(`Listing ${request.listingId} does not exist`)

      await dependencies.ListingModel.updateOne(
        { listingId: request.listingId },
        { $set: { updatedAt: new Date() } },
        { session },
      )
      const countQuery = dependencies.ListingSlotModel.countDocuments({
        listingId: request.listingId,
      })
      const existingSlotCount = await countQuery.session(session)
      const stockTotal = existingSlotCount + request.additionalSlots
      const publicStock = stockTotal - listing.reserveSlots
      const slots = Array.from(
        { length: request.additionalSlots },
        (_unused, index) => ({
          listingId: request.listingId,
          slotId: `${request.listingId}:slot:${String(existingSlotCount + index + 1).padStart(4, '0')}`,
          state: 'available' as const,
        }),
      )

      await dependencies.ListingSlotModel.insertMany(slots, { session })
      result = {
        listing: listing.toObject(),
        stockTotal,
        reserveSlots: listing.reserveSlots,
        publicStock,
        slots,
      }
    })
  } finally {
    await session.endSession()
  }

  if (!result) throw new Error('Listing slot transaction did not complete')
  return result
}

export async function seedListingInventory(
  client: Redis,
  input: {
    listing: {
      listingId: string
      saleStartsAt: Date
      saleEndsAt: Date
      reserveSlots: number
    }
    slots: Array<{ slotId: string }>
  },
) {
  const { listing, slots } = input
  const metaKey = `sale:{${listing.listingId}}:meta`
  const slotsKey = `sale:{${listing.listingId}}:available-slots`
  const seedResult = await client.eval(
    seedListingScript,
    2,
    metaKey,
    slotsKey,
    String(listing.saleStartsAt.getTime()),
    String(listing.saleEndsAt.getTime()),
    String(listing.reserveSlots),
    '1',
    ...slots.map((slot) => slot.slotId),
  )

  if (seedResult === -1)
    throw new Error(
      `Valkey inventory already exists for listing ${listing.listingId}`,
    )
  if (seedResult !== slots.length)
    throw new Error(
      `Valkey inventory seed failed for listing ${listing.listingId}`,
    )

  const slotCount = await client.llen(slotsKey)
  const seedCount = await client.hget(metaKey, 'seedCount')
  if (slotCount !== slots.length || seedCount !== String(slots.length))
    throw new Error(
      `Valkey inventory seed verification failed for listing ${listing.listingId}`,
    )

  const publishResult = await client.eval(
    publishListingScript,
    2,
    metaKey,
    slotsKey,
    String(slots.length),
  )
  if (publishResult !== 1)
    throw new Error(
      `Valkey inventory publication failed for listing ${listing.listingId}`,
    )
}

export async function releaseCancelledSlot(
  client: Redis,
  input: {
    listingId: string
    customerId: string
    orderId: string
    slotId: string
    orderStatus: 'CANCELLED'
  },
): Promise<boolean> {
  const { listingId, customerId, orderId, slotId, orderStatus } = input
  const activeCustomerField = encodeURIComponent(customerId)
  const result = await client.eval(
    releaseCancelledSlotScript,
    5,
    `sale:{${listingId}}:meta`,
    `sale:{${listingId}}:available-slots`,
    `sale:{${listingId}}:orders`,
    `sale:{${listingId}}:order:${orderId}:release`,
    `sale:{${listingId}}:active-customers`,
    orderId,
    listingId,
    customerId,
    activeCustomerField,
    slotId,
    orderStatus,
  )
  return result === 1
}
