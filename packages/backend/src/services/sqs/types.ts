import type { orderReservedEventSchema } from '#services/sqs/schema'
import type { z } from 'zod'

export type OrderReservedEvent = z.infer<typeof orderReservedEventSchema>

export type SqsMessage = {
  body: string
  receiptHandle: string
}
