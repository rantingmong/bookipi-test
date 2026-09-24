import type { Redis } from 'ioredis'

const claimSlotScript = `
if redis.call('HGET', KEYS[1], 'published') ~= '1' then
  return nil
end
local nowParts = redis.call('TIME')
local nowMilliseconds = tonumber(nowParts[1]) * 1000 + math.floor(tonumber(nowParts[2]) / 1000)
local saleStartsAt = tonumber(redis.call('HGET', KEYS[1], 'saleStartsAt') or '0')
local saleEndsAt = tonumber(redis.call('HGET', KEYS[1], 'saleEndsAt') or '0')
if nowMilliseconds < saleStartsAt or nowMilliseconds >= saleEndsAt then
  return nil
end
if redis.call('EXISTS', KEYS[3]) == 1 then
  if redis.call('HGET', KEYS[3], 'orderId') == ARGV[1]
    and redis.call('HGET', KEYS[3], 'status') == 'PENDING' then
    return redis.call('HGET', KEYS[3], 'slotId')
  end
  return nil
end
local slotId = redis.call('LPOP', KEYS[2])
if not slotId then
  return nil
end
redis.call('HSET', KEYS[3],
  'orderId', ARGV[1],
  'listingId', ARGV[2],
  'slotId', slotId,
  'status', 'PENDING'
)
return slotId
`

export async function claimAvailableSlot(
  client: Redis,
  input: { listingId: string; orderId: string },
): Promise<string | null> {
  const { listingId, orderId } = input
  const result = await client.eval(
    claimSlotScript,
    3,
    `sale:{${listingId}}:meta`,
    `sale:{${listingId}}:available-slots`,
    `sale:{${listingId}}:order:${orderId}`,
    orderId,
    listingId,
  )
  if (typeof result === 'string') return result
  return null
}
