import { Router } from 'express'

import { systemRouter } from '#api/system/router'

export const apiRouter = Router()

apiRouter.use('/system', systemRouter)
