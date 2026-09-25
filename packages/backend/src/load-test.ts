import {
  createAuthFeature,
  createMongoAuthAdapter,
} from '#features/auth/feature'
import { createLoadTestSessions } from '#features/load-test/feature'
import { readEnvConfig } from '#features/env/feature'
import { createMongoService } from '#services/mongodb/client'
import { createValkeyService } from '#services/valkey/client'

async function main() {
  const count = Number(process.argv[2])
  if (!Number.isSafeInteger(count) || count < 1) {
    throw new Error('Usage: load-test-sessions <positive-count>')
  }

  const config = readEnvConfig()
  const mongo = createMongoService(config.mongoUri, config.mongoDatabase)
  const valkey = createValkeyService(config.valkeyUrl)

  try {
    await Promise.all([mongo.connect(), valkey.client.connect()])

    const auth = createAuthFeature({
      config,
      database: createMongoAuthAdapter(mongo.database, mongo.client),
      secondaryStorage: valkey.secondaryStorage,
    })
    const sessions = await createLoadTestSessions(auth, count)
    process.stdout.write(`${JSON.stringify({ sessions })}\n`)
  } finally {
    await Promise.allSettled([mongo.close(), valkey.client.quit()])
  }
}

main().catch(() => {
  process.stderr.write('Could not create load-test sessions.\n')
  process.exitCode = 1
})
