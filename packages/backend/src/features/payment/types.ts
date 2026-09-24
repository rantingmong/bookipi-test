import type { OrderDocument } from '#features/order/types'
import type { paymentOutcomeSchema } from '#features/payment/schema'
import type { z } from 'zod'

export type PaymentOutcome = z.infer<typeof paymentOutcomeSchema>['outcome']

export type PaymentOrderModel = Pick<
  import('mongoose').Model<OrderDocument>,
  'findOneAndUpdate' | 'findOne'
>
