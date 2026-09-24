import { toNodeHandler } from 'better-auth/node'
import { createApp } from '#app'
import {
  createAuthFeature,
  createMongoAuthAdapter,
} from './features/auth/feature.js'
import { readEnvConfig } from './features/env/feature.js'
import { createMongoService } from './services/mongodb/client.js'
import { createValkeyService } from './services/valkey/client.js'

async function startServer() {
  const config = readEnvConfig()

  const mongo = createMongoService(config.mongoUri, config.mongoDatabase)
  const valkey = createValkeyService(config.valkeyUrl)

  try {
    await Promise.all([mongo.client.connect(), valkey.client.connect()])
    const auth = createAuthFeature({
      config,
      database: createMongoAuthAdapter(mongo.database, mongo.client),
      secondaryStorage: valkey.secondaryStorage,
    })
    const app = createApp({
      authHandler: toNodeHandler(auth.handler),
      storefrontOrigin: config.storefrontOrigin,
    })
    const port = Number(process.env.PORT ?? 3001)

    app.listen(port, () => {
      process.stdout.write(`Backend listening on port ${port}\n`)
    })
  } catch (error) {
    await Promise.allSettled([mongo.client.close(), valkey.client.quit()])
    throw error
  }
}

startServer().catch((error: unknown) => {
  let message = String(error)
  if (error instanceof Error) {
    message = error.message
  }
  process.stderr.write(`Backend startup failed: ${message}\n`)
  process.exitCode = 1
})
