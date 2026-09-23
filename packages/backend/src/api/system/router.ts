import { createRouter } from './generated/router.js'
import { systemHandlers } from './generated/handlers.js'

export const systemRouter = createRouter(systemHandlers)
