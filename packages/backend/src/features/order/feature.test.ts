import { describe, expect, it, vi } from 'vitest'
import { createConnection } from 'mongoose'
import {
  applyReservationFacts,
  orderInputSchema,
  orderStatuses,
} from '#features/order/feature'
import { createOrderModel } from '#features/order/models'

describe('order feature', () => {
  it('keeps Mongoose timestamps inside the insert-only update', async () => {
    const connection = createConnection()
    const { OrdersModel } = createOrderModel(connection)
    const event = {
      orderId: '8f67179c-73c6-49dc-984c-ed1735549d35',
      customerId: 'customer-001',
      listingId: 'listing-001',
      slotId: 'listing-001:slot:0001',
    }
    const findOneAndUpdate = vi
      .spyOn(OrdersModel.collection, 'findOneAndUpdate')
      .mockResolvedValue({ ...event, status: 'PENDING' } as never)

    try {
      await applyReservationFacts(OrdersModel, event)
      await applyReservationFacts(OrdersModel, event)

      expect(findOneAndUpdate).toHaveBeenCalledTimes(2)
      for (const call of findOneAndUpdate.mock.calls) {
        const update = call[1] as {
          $set?: Record<string, unknown>
          $setOnInsert?: Record<string, unknown>
        }
        expect(update.$set).toBeUndefined()
        expect(update.$setOnInsert).toEqual(
          expect.objectContaining({
            ...event,
            status: 'PENDING',
            createdAt: expect.any(Date),
            updatedAt: expect.any(Date),
          }),
        )
      }
    } finally {
      await connection.close()
    }
  })

  it('inserts reservation facts as PENDING and preserves them on replay', async () => {
    const findOneAndUpdate = vi.fn(async (_filter, update) => ({
      orderId: '8f67179c-73c6-49dc-984c-ed1735549d35',
      customerId: 'customer-001',
      listingId: 'listing-001',
      slotId: 'listing-001:slot:0001',
      status: 'PENDING',
      ...update.$setOnInsert,
    }))
    const model = { findOneAndUpdate }
    const event = {
      orderId: '8f67179c-73c6-49dc-984c-ed1735549d35',
      customerId: 'customer-001',
      listingId: 'listing-001',
      slotId: 'listing-001:slot:0001',
    }

    await applyReservationFacts(model as never, event)
    await applyReservationFacts(model as never, event)

    expect(findOneAndUpdate).toHaveBeenCalledTimes(2)
    expect(findOneAndUpdate).toHaveBeenNthCalledWith(
      1,
      { orderId: event.orderId },
      {
        $setOnInsert: {
          ...event,
          status: 'PENDING',
          updatedAt: expect.any(Date),
        },
      },
      {
        upsert: true,
        returnDocument: 'after',
        timestamps: { updatedAt: false },
      },
    )
  })

  it('does not reopen a terminal order when a delayed event arrives', async () => {
    const findOneAndUpdate = vi.fn(
      async (_filter: unknown, _update: unknown) => ({
        orderId: '8f67179c-73c6-49dc-984c-ed1735549d35',
        customerId: 'customer-001',
        listingId: 'listing-001',
        slotId: 'listing-001:slot:0001',
        status: 'CANCELLED',
      }),
    )

    const result = await applyReservationFacts({ findOneAndUpdate } as never, {
      orderId: '8f67179c-73c6-49dc-984c-ed1735549d35',
      customerId: 'customer-001',
      listingId: 'listing-001',
      slotId: 'listing-001:slot:0001',
    })

    expect(result.status).toBe('CANCELLED')
    expect(findOneAndUpdate.mock.calls[0]?.[1]).toEqual({
      $setOnInsert: {
        orderId: '8f67179c-73c6-49dc-984c-ed1735549d35',
        customerId: 'customer-001',
        listingId: 'listing-001',
        slotId: 'listing-001:slot:0001',
        status: 'PENDING',
        updatedAt: expect.any(Date),
      },
    })
  })

  it('rejects an event that conflicts with stored reservation facts', async () => {
    const findOneAndUpdate = vi.fn(
      async (_filter: unknown, _update: unknown) => ({
        orderId: '8f67179c-73c6-49dc-984c-ed1735549d35',
        customerId: 'customer-001',
        listingId: 'listing-001',
        slotId: 'listing-001:slot:0001',
        status: 'PENDING',
      }),
    )

    await expect(
      applyReservationFacts({ findOneAndUpdate } as never, {
        orderId: '8f67179c-73c6-49dc-984c-ed1735549d35',
        customerId: 'customer-002',
        listingId: 'listing-001',
        slotId: 'listing-001:slot:0001',
      }),
    ).rejects.toThrow('Conflicting reservation facts for order')
  })

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

    const models = createOrderModel(connection as never)
    expect(models.OrdersModel).toBeDefined()

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
