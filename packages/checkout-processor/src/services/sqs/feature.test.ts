import { SendMessageCommand, type SQSClient } from '@aws-sdk/client-sqs'
import { describe, expect, it, vi } from 'vitest'
import { publishOrderReservedEvent } from './feature.js'

describe('SQS service', () => {
  it('sends the validated immutable order reservation event', async () => {
    const send = vi.fn(async (..._args: unknown[]) => ({
      MessageId: 'message-1',
    }))
    const event = {
      eventType: 'order-reserved.v1' as const,
      orderId: '8f67179c-73c6-49dc-984c-ed1735549d35',
      customerId: 'customer-1',
      listingId: 'sale-1',
      slotId: 'sale-1:slot:0001',
    }

    await publishOrderReservedEvent(
      { send } as unknown as Pick<SQSClient, 'send'>,
      'https://sqs.example/order-events',
      event,
    )

    expect(send).toHaveBeenCalledOnce()
    const command = send.mock.calls[0]?.[0] as SendMessageCommand | undefined
    expect(command).toBeInstanceOf(SendMessageCommand)
    expect(command?.input).toEqual({
      QueueUrl: 'https://sqs.example/order-events',
      MessageBody: JSON.stringify(event),
    })
  })

  it('rejects extra event fields before sending', async () => {
    const send = vi.fn()

    await expect(
      publishOrderReservedEvent(
        { send } as unknown as Pick<SQSClient, 'send'>,
        'https://sqs.example/order-events',
        {
          eventType: 'order-reserved.v1',
          orderId: '8f67179c-73c6-49dc-984c-ed1735549d35',
          customerId: 'customer-1',
          listingId: 'sale-1',
          slotId: 'slot-1',
          amount: 1,
        } as never,
      ),
    ).rejects.toThrow()
    expect(send).not.toHaveBeenCalled()
  })
})
