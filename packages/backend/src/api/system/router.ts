import { createRouter } from '#api/system/generated/router'
import { systemHandlers } from '#api/system/generated/handlers'

export const systemRouter = createRouter(systemHandlers)
