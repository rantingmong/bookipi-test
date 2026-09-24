import { z } from 'zod'

export const mongoServiceConfigSchema = z.object({
  mongoUri: z.string().min(1),
  mongoDatabase: z.string().min(1),
})
