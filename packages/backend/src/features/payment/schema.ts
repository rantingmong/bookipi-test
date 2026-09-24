import { z } from 'zod'

export const paymentOutcomeSchema = z
  .object({
    outcome: z.enum(['success', 'failure', 'expired']),
  })
  .strict()
