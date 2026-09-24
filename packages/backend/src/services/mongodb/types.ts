import type { Connection } from 'mongoose'
import type { Db, MongoClient } from 'mongodb'
import type { mongoServiceConfigSchema } from '#services/mongodb/schema'
import type { z } from 'zod'

export type MongoServiceConfig = z.infer<typeof mongoServiceConfigSchema>

export type MongoService = {
  connection: Connection
  client: MongoClient
  database: Db
  connect(): Promise<void>
  close(): Promise<void>
}
