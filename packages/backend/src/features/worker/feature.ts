import {
  applyReservationFacts,
  ReservationFactsConflictError,
} from '#features/order/feature'
import type { OrderDocument } from '#features/order/types'
import {
  acknowledgeSqsMessage,
  parseOrderReservedEvent,
  receiveSqsMessages,
} from '#services/sqs/client'
import type { SqsMessage } from '#services/sqs/types'
import type { SQSClient } from '@aws-sdk/client-sqs'
import type { Model } from 'mongoose'

export function createWorkerFeature(sqs: SQSClient, queueUrl: string) {
  let stopRequested = false

  return {
    queueUrl,
    sqs,
    shouldStop() {
      return stopRequested
    },
    receiveMessages() {
      return receiveSqsMessages(sqs, queueUrl)
    },
    stop() {
      stopRequested = true
    },
  }
}

export async function processSqsBatch(
  messages: SqsMessage[],
  ordersModel: Model<OrderDocument>,
  sqs: SQSClient,
  queueUrl: string,
): Promise<void> {
  for (const message of messages) {
    let event
    try {
      event = parseOrderReservedEvent(message.body)
    } catch (error) {
      reportMessageError(error)
      continue
    }

    try {
      await applyReservationFacts(ordersModel, event)
    } catch (error) {
      if (!(error instanceof ReservationFactsConflictError)) throw error
      reportMessageError(error)
      continue
    }

    await acknowledgeSqsMessage(sqs, queueUrl, message.receiptHandle)
  }
}

function reportMessageError(error: unknown) {
  let detail = String(error)
  if (error instanceof Error) detail = error.message
  process.stderr.write(`SQS message processing failed: ${detail}\n`)
}
