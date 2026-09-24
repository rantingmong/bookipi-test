import { readListingSeedEnvConfig } from '#features/env/feature'
import { createListingModels } from '#features/listing/models'
import { createOrderModel } from '#features/order/models'
import { seedListingData } from '#features/seed/feature'
import { createMongoService } from '#services/mongodb/client'
import { createValkeyService } from '#services/valkey/client'

async function runSeed() {
  const config = readListingSeedEnvConfig()
  const mongo = createMongoService(config.mongoUri, config.mongoDatabase)
  const valkey = createValkeyService(config.valkeyUrl)

  try {
    await Promise.all([mongo.connect(), valkey.client.connect()])
    const listingModels = createListingModels(mongo.connection)
    const orderModels = createOrderModel(mongo.connection)
    await Promise.all([
      listingModels.ListingModel.init(),
      listingModels.ListingSlotModel.init(),
      orderModels.OrdersModel.init(),
    ])
    await seedListingData({
      ...listingModels,
      ...orderModels,
      mongoConnection: mongo.connection,
      valkeyConnection: valkey.client,
    })
    process.stdout.write('Seeded listing, slots, and Valkey inventory.\n')
  } finally {
    await Promise.allSettled([mongo.close(), valkey.client.quit()])
  }
}

runSeed().catch((error: unknown) => {
  let message = String(error)
  if (error instanceof Error) message = error.message
  process.stderr.write(`Backend seed failed: ${message}\n`)
  process.exitCode = 1
})
