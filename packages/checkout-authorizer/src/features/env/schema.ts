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
  BETTER_AUTH_URL: exactOriginSchema,
  BETTER_AUTH_SECRET: z.string().min(1),
  STOREFRONT_ORIGIN: exactOriginSchema,
  VALKEY_URL: z.url(),
})

export type Environment = z.infer<typeof environmentSchema>
