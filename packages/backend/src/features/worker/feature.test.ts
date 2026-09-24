import { describe, expect, it, vi } from 'vitest'
import { createWorkerFeature, processSqsBatch } from '#features/worker/feature'

const event = {
  eventType: 'order-reserved.v1',
  orderId: '8f67179c-73c6-49dc-984c-ed1735549d35',
  customerId: 'customer-001',
  listingId: 'listing-001',
  slotId: 'listing-001:slot:0001',
}

describe('order reservation worker', () => {
  it('continues after malformed and conflicting messages', async () => {
    const findOneAndUpdate = vi
      .fn()
      .mockResolvedValueOnce({
        ...event,
        customerId: 'another-customer',
        status: 'PENDING',
      })
      .mockResolvedValueOnce({
        orderId: '8f67179c-73c6-49dc-984c-ed1735549d35',
        customerId: 'customer-001',
        listingId: 'listing-001',
        slotId: 'listing-001:slot:0001',
        status: 'PENDING',
      })
    const send = vi.fn(async () => ({}))
    const write = vi.spyOn(process.stderr, 'write').mockReturnValue(true)

    try {
      await processSqsBatch(
        [
          { body: '{broken', receiptHandle: 'malformed' },
          { body: JSON.stringify(event), receiptHandle: 'conflict' },
          { body: JSON.stringify(event), receiptHandle: 'valid' },
        ],
        { findOneAndUpdate } as never,
        { send } as never,
        'https://sqs.example/order-events',
      )

      expect(findOneAndUpdate).toHaveBeenCalledTimes(2)
      expect(send).toHaveBeenCalledOnce()
      expect(write).toHaveBeenCalledTimes(2)
    } finally {
      write.mockRestore()
    }
  })

  it('owns the receive operation and stop state', async () => {
    const send = vi.fn(async () => ({
      Messages: [
        { Body: JSON.stringify(event), ReceiptHandle: 'receipt-handle' },
      ],
    }))
    const worker = createWorkerFeature(
      { send } as never,
      'https://sqs.example/order-events',
    )

    expect(worker.shouldStop()).toBe(false)
    await expect(worker.receiveMessages()).resolves.toEqual([
      { body: JSON.stringify(event), receiptHandle: 'receipt-handle' },
    ])

    worker.stop()

    expect(worker.shouldStop()).toBe(true)
    expect(send).toHaveBeenCalledOnce()
  })
})
