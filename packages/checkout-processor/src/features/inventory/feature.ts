import type { Redis } from 'ioredis'

const claimSlotScript = `
local idempotencyField = ARGV[4] .. ':' .. ARGV[5]
local idempotencyOrderId = redis.call('HGET', KEYS[3], idempotencyField)
if idempotencyOrderId then
  local orderStatusField = idempotencyOrderId .. ':status'
  local orderSlotField = idempotencyOrderId .. ':slotId'
  local orderStatus = redis.call('HGET', KEYS[5], orderStatusField)
  local slotId = redis.call('HGET', KEYS[5], orderSlotField)
  if orderStatus == 'PENDING' and slotId then
    return {'RESERVED', idempotencyOrderId, slotId}
  end
  if orderStatus == 'CANCELLED' then
    return {'CANCELLED'}
  end
  return {'UNAVAILABLE'}
end
if redis.call('HGET', KEYS[1], 'published') ~= '1' then
  return {'UNPUBLISHED'}
end
local nowParts = redis.call('TIME')
local nowMilliseconds = tonumber(nowParts[1]) * 1000 + math.floor(tonumber(nowParts[2]) / 1000)
local saleStartsAt = tonumber(redis.call('HGET', KEYS[1], 'saleStartsAt') or '0')
local saleEndsAt = tonumber(redis.call('HGET', KEYS[1], 'saleEndsAt') or '0')
if nowMilliseconds < saleStartsAt or nowMilliseconds >= saleEndsAt then
  return {'CLOSED'}
end
if redis.call('HEXISTS', KEYS[4], ARGV[4]) == 1 then
  return {'ALREADY_ACTIVE'}
end
local slotId = redis.call('LPOP', KEYS[2])
if not slotId then
  return {'SOLD_OUT'}
end
local candidateOrderId = ARGV[3]
local orderPrefix = candidateOrderId .. ':'
redis.call('HSET', KEYS[5],
  orderPrefix .. 'orderId', candidateOrderId,
  orderPrefix .. 'customerId', ARGV[1],
  orderPrefix .. 'listingId', ARGV[2],
  orderPrefix .. 'slotId', slotId,
  orderPrefix .. 'status', 'PENDING'
)
redis.call('HSET', KEYS[3], idempotencyField, candidateOrderId)
redis.call('HSET', KEYS[4], ARGV[4], candidateOrderId)
return {'RESERVED', ARGV[3], slotId}
`

export type InventoryClaim =
  | { status: 'reserved'; orderId: string; slotId: string }
  | {
      status:
        | 'unpublished'
        | 'closed'
        | 'sold-out'
        | 'already-active'
        | 'cancelled'
        | 'unavailable'
    }

export async function claimAvailableSlot(
  client: Redis,
  input: {
    listingId: string
    customerId: string
    idempotencyKey: string
    candidateOrderId: string
  },
): Promise<InventoryClaim> {
  const { listingId, customerId, idempotencyKey, candidateOrderId } = input
  const safeCustomerId = encodeURIComponent(customerId)
  const safeIdempotencyKey = encodeURIComponent(idempotencyKey)
  const result = await client.eval(
    claimSlotScript,
    5,
    `sale:{${listingId}}:meta`,
    `sale:{${listingId}}:available-slots`,
    `sale:{${listingId}}:idempotency`,
    `sale:{${listingId}}:active-customers`,
    `sale:{${listingId}}:orders`,
    customerId,
    listingId,
    candidateOrderId,
    safeCustomerId,
    safeIdempotencyKey,
  )

  if (!Array.isArray(result)) return { status: 'unavailable' }
  const [status, orderId, slotId] = result
  if (
    status === 'RESERVED' &&
    typeof orderId === 'string' &&
    typeof slotId === 'string'
  ) {
    return { status: 'reserved', orderId, slotId }
  }
  if (status === 'UNPUBLISHED') return { status: 'unpublished' }
  if (status === 'CLOSED') return { status: 'closed' }
  if (status === 'SOLD_OUT') return { status: 'sold-out' }
  if (status === 'ALREADY_ACTIVE') return { status: 'already-active' }
  if (status === 'CANCELLED') return { status: 'cancelled' }
  return { status: 'unavailable' }
}
