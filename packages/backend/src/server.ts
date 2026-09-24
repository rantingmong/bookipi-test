import { createApp } from '#app'
import {
  createAuthFeature,
  createMongoAuthAdapter,
} from '#features/auth/feature'
import { readEnvConfig, readOrderWorkerEnvConfig } from '#features/env/feature'
import { createListingModels } from '#features/listing/models'
import { createOrderModel } from '#features/order/models'
import { createWorkerFeature, processSqsBatch } from '#features/worker/feature'
import { listenHttpServer } from '#services/http/server'
import { createMongoService } from '#services/mongodb/client'
import { createSqsClient } from '#services/sqs/client'
import { createValkeyService } from '#services/valkey/client'
import { toNodeHandler } from 'better-auth/node'

async function prepare() {
  const config = readEnvConfig()
  const workerConfig = readOrderWorkerEnvConfig()

  const mongo = createMongoService(config.mongoUri, config.mongoDatabase)
  const sqs = createSqsClient(workerConfig.awsRegion)
  const valkey = createValkeyService(config.valkeyUrl)
  const worker = createWorkerFeature(sqs, workerConfig.sqsQueueUrl)

  async function shutdown() {
    worker.stop()
    sqs.destroy()
    await Promise.allSettled([mongo.close(), valkey.client.quit()])
  }

  try {
    await Promise.all([mongo.connect(), valkey.client.connect()])

    const listingModels = createListingModels(mongo.connection)
    const orderModel = createOrderModel(mongo.connection)
    await Promise.all([
      listingModels.ListingModel.init(),
      listingModels.ListingSlotModel.init(),
      orderModel.OrdersModel.init(),
    ])

    const auth = createAuthFeature({
      config,
      database: createMongoAuthAdapter(mongo.database, mongo.client),
      secondaryStorage: valkey.secondaryStorage,
    })

    return {
      auth,
      config,
      orderModel,
      worker,
      shutdown,
    }
  } catch (error) {
    await shutdown()
    throw error
  }
}

async function startServer({
  auth,
  config,
  shutdown,
}: Awaited<ReturnType<typeof prepare>>) {
  try {
    const app = createApp({
      authHandler: toNodeHandler(auth.handler),
      storefrontOrigin: config.storefrontOrigin,
    })
    const port = Number(process.env.PORT ?? 3001)
    const server = await listenHttpServer(app, port)
    process.stdout.write(`Backend listening on port ${port}\n`)

    return server
  } catch (error) {
    await shutdown()
    throw error
  }
}

async function startWorker({
  orderModel,
  worker,
}: Awaited<ReturnType<typeof prepare>>) {
  while (!worker.shouldStop()) {
    const messages = await worker.receiveMessages()
    await processSqsBatch(
      messages,
      orderModel.OrdersModel,
      worker.sqs,
      worker.queueUrl,
    )
  }
}

const context = await prepare()

const server = await startServer(context).catch((error: unknown) => {
  let message = String(error)
  if (error instanceof Error) {
    message = error.message
  }
  process.stderr.write(`Backend startup failed: ${message}\n`)
  process.exitCode = 1
  return undefined
})

if (server) {
  startWorker(context).catch(async (error: unknown) => {
    let message = String(error)
    if (error instanceof Error) {
      message = error.message
    }
    process.stderr.write(`Order worker failed: ${message}\n`)
    process.exitCode = 1

    const serverClosed = new Promise<void>((resolve) => {
      server.close(() => resolve())
    })
    server.closeAllConnections()
    await serverClosed
    await context.shutdown()
  })
}
