import { z } from 'zod'

const exactOriginSchema = z.string().superRefine((value, context) => {
  try {
    const parsed = new URL(value)
    if (
      !['http:', 'https:'].includes(parsed.protocol) ||
      parsed.origin !== value
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Expected an exact HTTP origin',
      })
    }
  } catch {
    context.addIssue({
      code: 'custom',
      message: 'Expected an exact HTTP origin',
    })
  }
})

export const environmentSchema = z.object({
  VALKEY_URL: z.url(),
  ORDER_EVENTS_QUEUE_URL: z.url(),
  STOREFRONT_ORIGIN: z.string().optional(),
})

export const localAdapterEnvironmentSchema = environmentSchema.extend({
  BETTER_AUTH_URL: exactOriginSchema,
  BETTER_AUTH_SECRET: z.string().min(1),
  STOREFRONT_ORIGIN: exactOriginSchema,
})

export type Environment = z.infer<typeof environmentSchema>
export type LocalAdapterEnvironment = z.infer<
  typeof localAdapterEnvironmentSchema
>
