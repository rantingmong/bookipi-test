import { readMongoEnvConfig } from '#features/env/feature'
import { createListingModels } from '#features/listing/models'
import { seedListingData } from '#features/listing/seed'
import { createMongoService } from '#services/mongodb/client'

async function runSeed() {
  const config = readMongoEnvConfig()
  const mongo = createMongoService(config.mongoUri, config.mongoDatabase)

  try {
    await mongo.connect()
    const listingModels = createListingModels(mongo.connection)
    await Promise.all([
      listingModels.ListingModel.init(),
      listingModels.ListingSlotModel.init(),
    ])
    await seedListingData({
      connection: mongo.connection,
      ...listingModels,
    })
    process.stdout.write(
      'Seeded listing and slots. Valkey state is unchanged.\n',
    )
  } finally {
    await mongo.close()
  }
}

runSeed().catch((error: unknown) => {
  let message = String(error)
  if (error instanceof Error) message = error.message
  process.stderr.write(`Backend seed failed: ${message}\n`)
  process.exitCode = 1
})
