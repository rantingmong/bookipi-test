import { describe, expect, it, vi } from 'vitest'
import { orderInputSchema, orderStatuses } from '#features/order/feature'
import { createOrderModel } from '#features/order/models'

describe('order feature', () => {
  it('requires the complete minimal order shape and known statuses', () => {
    expect(
      orderInputSchema.parse({
        orderId: 'order-001',
        customerId: 'customer-001',
        listingId: 'listing-001',
        slotId: 'listing-001:slot:0001',
        status: 'PENDING',
      }),
    ).toMatchObject({ status: 'PENDING' })
    expect(orderStatuses).toEqual(['PENDING', 'COMPLETE', 'CANCELLED'])
    expect(() =>
      orderInputSchema.parse({ orderId: 'order-001', status: 'PENDING' }),
    ).toThrow()
    expect(() =>
      orderInputSchema.parse({
        orderId: 'order-001',
        customerId: 'customer-001',
        listingId: 'listing-001',
        slotId: 'listing-001:slot:0001',
        status: 'UNKNOWN',
      }),
    ).toThrow()
    expect(() =>
      orderInputSchema.parse({
        orderId: 'order-001',
        customerId: 'customer-001',
        listingId: 'listing-001',
        slotId: 'listing-001:slot:0001',
        status: 'PENDING',
        idempotencyKey: 'client-only-key',
      }),
    ).toThrow()
  })

  it('defines required collection and unique order and active ownership indexes', () => {
    const connection = {
      models: {},
      model: vi.fn((_name, _schema, collection) => ({
        collection: { name: collection },
      })),
    }

    createOrderModel(connection as never)

    expect(connection.model).toHaveBeenCalledWith(
      'Order',
      expect.anything(),
      'orders',
    )
    const schema = connection.model.mock.calls[0]?.[1]
    const indexes = schema.indexes()
    expect(indexes).toContainEqual([{ orderId: 1 }, { unique: true }])
    expect(indexes).toContainEqual([
      { listingId: 1, customerId: 1 },
      {
        unique: true,
        partialFilterExpression: {
          $and: [
            { listingId: { $exists: true } },
            { customerId: { $exists: true } },
            { status: { $in: ['PENDING', 'COMPLETE'] } },
          ],
        },
      },
    ])
    expect(indexes).toContainEqual([
      { listingId: 1, slotId: 1 },
      {
        unique: true,
        partialFilterExpression: {
          $and: [
            { listingId: { $exists: true } },
            { slotId: { $exists: true } },
            { status: { $in: ['PENDING', 'COMPLETE'] } },
          ],
        },
      },
    ])
  })
})
