import {
  DeleteMessageCommand,
  ReceiveMessageCommand,
  type SQSClient,
} from '@aws-sdk/client-sqs'
import { describe, expect, it, vi } from 'vitest'
import {
  acknowledgeSqsMessage,
  createSqsClient,
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
  it('uses the configured endpoint for local SQS', async () => {
    const client = createSqsClient('us-east-1', 'http://localstack:4566')

    const endpointProvider = client.config.endpoint
    expect(endpointProvider).toBeDefined()
    if (!endpointProvider) throw new Error('SQS endpoint is not configured')
    expect(await endpointProvider()).toMatchObject({
      hostname: 'localstack',
      port: 4566,
    })
    client.destroy()
  })

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
