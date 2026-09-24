import { MongoClient } from 'mongodb'

export function createMongoService(uri: string, databaseName: string) {
  const client = new MongoClient(uri)
  return { client, database: client.db(databaseName) }
}
