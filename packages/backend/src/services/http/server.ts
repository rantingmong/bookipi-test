import type { Express } from 'express'
import type { Server } from 'node:http'

export function listenHttpServer(
  app: Pick<Express, 'listen'>,
  port: number,
): Promise<Server> {
  const server = app.listen(port)

  return new Promise((resolve, reject) => {
    const handleListening = () => {
      server.off('error', handleError)
      resolve(server)
    }
    const handleError = (error: Error) => {
      server.off('listening', handleListening)
      reject(error)
    }

    server.once('listening', handleListening)
    server.once('error', handleError)
  })
}
