import { sqsBatchSize, sqsLongPollSeconds } from '#services/sqs/constants'
import { orderReservedEventSchema } from '#services/sqs/schema'
import type { OrderReservedEvent, SqsMessage } from '#services/sqs/types'
import {
  DeleteMessageCommand,
  ReceiveMessageCommand,
  SQSClient,
  type SQSClient as SqsSdkClient,
} from '@aws-sdk/client-sqs'
import type { SQSClientConfig } from '@aws-sdk/client-sqs'

export function createSqsClient(
  region: string,
  endpointUrl?: string,
): SQSClient {
  const config: SQSClientConfig = { region }
  if (endpointUrl) config.endpoint = endpointUrl
  return new SQSClient(config)
}

export async function receiveSqsMessages(
  client: Pick<SqsSdkClient, 'send'>,
  queueUrl: string,
): Promise<SqsMessage[]> {
  const result = await client.send(
    new ReceiveMessageCommand({
      QueueUrl: queueUrl,
      MaxNumberOfMessages: sqsBatchSize,
      WaitTimeSeconds: sqsLongPollSeconds,
    }),
  )
  const messages: SqsMessage[] = []

  for (const message of result.Messages ?? []) {
    if (!message.Body || !message.ReceiptHandle) continue
    messages.push({ body: message.Body, receiptHandle: message.ReceiptHandle })
  }

  return messages
}

export function parseOrderReservedEvent(body: string): OrderReservedEvent {
  return orderReservedEventSchema.parse(JSON.parse(body))
}

export async function acknowledgeSqsMessage(
  client: Pick<SqsSdkClient, 'send'>,
  queueUrl: string,
  receiptHandle: string,
): Promise<void> {
  await client.send(
    new DeleteMessageCommand({
      QueueUrl: queueUrl,
      ReceiptHandle: receiptHandle,
    }),
  )
}
