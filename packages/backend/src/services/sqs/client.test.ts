import {
  DeleteMessageCommand,
  ReceiveMessageCommand,
  type SQSClient,
} from '@aws-sdk/client-sqs'
import { describe, expect, it, vi } from 'vitest'
import {
  acknowledgeSqsMessage,
  parseOrderReservedEvent,
  receiveSqsMessages,
} from '#services/sqs/client'

const event = {
  eventType: 'order-reserved.v1',
  orderId: '8f67179c-73c6-49dc-984c-ed1735549d35',
  customerId: 'customer-001',
  listingId: 'listing-001',
  slotId: 'listing-001:slot:0001',
}

describe('SQS service', () => {
  it('long-polls a bounded batch of messages', async () => {
    const send = vi.fn(async (_command: ReceiveMessageCommand) => ({
      Messages: [{ Body: JSON.stringify(event), ReceiptHandle: 'receipt-1' }],
    }))

    const messages = await receiveSqsMessages(
      { send } as unknown as Pick<SQSClient, 'send'>,
      'https://sqs.example/order-events',
    )

    const command = send.mock.calls[0]?.[0] as ReceiveMessageCommand | undefined
    expect(command).toBeInstanceOf(ReceiveMessageCommand)
    expect(command?.input).toEqual({
      QueueUrl: 'https://sqs.example/order-events',
      MaxNumberOfMessages: 10,
      WaitTimeSeconds: 20,
    })
    expect(messages).toEqual([
      { body: JSON.stringify(event), receiptHandle: 'receipt-1' },
    ])
  })

  it('requires the strict order-reserved event shape', () => {
    expect(parseOrderReservedEvent(JSON.stringify(event))).toEqual(event)
    expect(() =>
      parseOrderReservedEvent(JSON.stringify({ ...event, amount: 1 })),
    ).toThrow()
    expect(() => parseOrderReservedEvent('{broken')).toThrow()
  })

  it('deletes a message only when the worker requests acknowledgement', async () => {
    const send = vi.fn(async (_command: DeleteMessageCommand) => ({}))

    await acknowledgeSqsMessage(
      { send } as unknown as Pick<SQSClient, 'send'>,
      'https://sqs.example/order-events',
      'receipt-1',
    )

    const command = send.mock.calls[0]?.[0] as DeleteMessageCommand | undefined
    expect(command).toBeInstanceOf(DeleteMessageCommand)
    expect(command?.input).toEqual({
      QueueUrl: 'https://sqs.example/order-events',
      ReceiptHandle: 'receipt-1',
    })
  })
})
