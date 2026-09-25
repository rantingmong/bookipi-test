import { z } from 'zod'

export const environmentSchema = z.object({
  VALKEY_URL: z.url(),
  ORDER_EVENTS_QUEUE_URL: z.url(),
  STOREFRONT_ORIGIN: z.string().optional(),
})

export type Environment = z.infer<typeof environmentSchema>
