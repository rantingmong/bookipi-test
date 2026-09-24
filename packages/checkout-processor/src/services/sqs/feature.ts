import { SendMessageCommand, type SQSClient } from '@aws-sdk/client-sqs'
import {
  orderReservedEventSchema,
  type OrderReservedEvent,
} from '../../features/checkout/schema.js'

export async function publishOrderReservedEvent(
  client: Pick<SQSClient, 'send'>,
  queueUrl: string,
  input: OrderReservedEvent,
): Promise<void> {
  const event = orderReservedEventSchema.parse(input)
  await client.send(
    new SendMessageCommand({
      QueueUrl: queueUrl,
      MessageBody: JSON.stringify(event),
    }),
  )
}
