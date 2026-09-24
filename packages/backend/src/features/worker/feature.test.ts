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
  it('reconciles the stored order before acknowledging its SQS message', async () => {
    const order = {
      ...event,
      status: 'CANCELLED',
      releaseStatus: 'PENDING',
    }
    const steps: string[] = []
    const findOneAndUpdate = vi.fn(async () => order)
    const updateOne = vi.fn(async () => {
      steps.push('complete')
      return { modifiedCount: 1 }
    })
    const evalScript = vi.fn(async () => {
      steps.push('release')
      return 1
    })
    const send = vi.fn(async () => {
      steps.push('acknowledge')
      return {}
    })

    await processSqsBatch(
      [{ body: JSON.stringify(event), receiptHandle: 'valid' }],
      { findOneAndUpdate, updateOne } as never,
      { send } as never,
      'https://sqs.example/order-events',
      { eval: evalScript } as never,
    )

    expect(evalScript).toHaveBeenCalledOnce()
    expect(steps).toEqual(['release', 'complete', 'acknowledge'])
  })

  it('leaves a message unacknowledged when guarded release fails', async () => {
    const findOneAndUpdate = vi.fn(async () => ({
      ...event,
      status: 'CANCELLED',
      releaseStatus: 'PENDING',
    }))
    const send = vi.fn()

    await expect(
      processSqsBatch(
        [{ body: JSON.stringify(event), receiptHandle: 'retry' }],
        { findOneAndUpdate, updateOne: vi.fn() } as never,
        { send } as never,
        'https://sqs.example/order-events',
        { eval: vi.fn(async () => 0) } as never,
      ),
    ).rejects.toThrow('Guarded slot release failed')

    expect(send).not.toHaveBeenCalled()
  })

  it('continues after malformed and conflicting messages', async () => {
    const findOneAndUpdate = vi
      .fn()
      .mockResolvedValueOnce({
        ...event,
        customerId: 'another-customer',
        status: 'PENDING',
      })
      .mockResolvedValueOnce({
        orderId: event.orderId,
        customerId: event.customerId,
        listingId: event.listingId,
        slotId: event.slotId,
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
        { eval: vi.fn(async () => 1) } as never,
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
