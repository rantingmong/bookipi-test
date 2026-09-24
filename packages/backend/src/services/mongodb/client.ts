import { createConnection } from 'mongoose'
import { mongoConnectionError } from '#services/mongodb/constants'
import type { MongoService } from '#services/mongodb/types'

export function createMongoService(
  uri: string,
  databaseName: string,
): MongoService {
  const connection = createConnection(uri, { dbName: databaseName })
  const service = {
    connection,
    get client() {
      return connection.getClient()
    },
    get database() {
      if (!connection.db) throw new Error(mongoConnectionError)
      return connection.db
    },
    async connect() {
      await connection.asPromise()
    },
    async close() {
      await connection.close()
    },
  }
  return service
}
