import { z } from 'zod'

function requiredEnvValue(name: string) {
  return z.preprocess(
    (value) => {
      if (typeof value !== 'string') return ''
      return value.trim()
    },
    z.string().min(1, `Missing required environment variable ${name}`),
  )
}

const exactOriginSchema = z.string().superRefine((value, context) => {
  try {
    const parsedUrl = new URL(value)
    if (
      !['http:', 'https:'].includes(parsedUrl.protocol) ||
      parsedUrl.origin !== value
    ) {
      context.addIssue({ code: 'custom' })
    }
  } catch {
    context.addIssue({ code: 'custom' })
  }
})

export const authEnvSchema = z
  .object({
    BETTER_AUTH_URL: requiredEnvValue('BETTER_AUTH_URL'),
    BETTER_AUTH_SECRET: requiredEnvValue('BETTER_AUTH_SECRET'),
    MONGODB_URI: requiredEnvValue('MONGODB_URI'),
    MONGODB_DATABASE: requiredEnvValue('MONGODB_DATABASE'),
    VALKEY_URL: requiredEnvValue('VALKEY_URL'),
    STOREFRONT_ORIGIN: z.preprocess((value) => {
      if (typeof value !== 'string') return undefined
      return value.trim() || undefined
    }, z.string().optional()),
  })
  .superRefine((environment, context) => {
    const authUrl = exactOriginSchema.safeParse(environment.BETTER_AUTH_URL)
    if (!authUrl.success) {
      context.addIssue({
        code: 'custom',
        path: ['BETTER_AUTH_URL'],
        message:
          'BETTER_AUTH_URL must be an HTTP or HTTPS origin without a path',
      })
    }

    if (environment.STOREFRONT_ORIGIN) {
      const storefrontOrigin = exactOriginSchema.safeParse(
        environment.STOREFRONT_ORIGIN,
      )
      if (!storefrontOrigin.success) {
        context.addIssue({
          code: 'custom',
          path: ['STOREFRONT_ORIGIN'],
          message: 'STOREFRONT_ORIGIN must be an exact origin without a path',
        })
      }
    }
  })

export const mongoEnvSchema = z.object({
  MONGODB_URI: z.string().min(1),
  MONGODB_DATABASE: z.string().min(1),
})

export const listingSeedEnvSchema = z.object({
  MONGODB_URI: requiredEnvValue('MONGODB_URI'),
  MONGODB_DATABASE: requiredEnvValue('MONGODB_DATABASE'),
  VALKEY_URL: requiredEnvValue('VALKEY_URL'),
})

export const orderWorkerEnvSchema = z.object({
  MONGODB_URI: requiredEnvValue('MONGODB_URI'),
  MONGODB_DATABASE: requiredEnvValue('MONGODB_DATABASE'),
  AWS_REGION: requiredEnvValue('AWS_REGION'),
  SQS_QUEUE_URL: requiredEnvValue('SQS_QUEUE_URL'),
})
