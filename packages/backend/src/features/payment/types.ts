import type { paymentOutcomeSchema } from '#features/payment/schema'
import type { z } from 'zod'

export type PaymentOutcome = z.infer<typeof paymentOutcomeSchema>['outcome']
