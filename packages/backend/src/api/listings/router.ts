import { createRouter } from '#api/listings/generated/router'
import { listingsHandlers } from '#api/listings/generated/handlers'

export function createListingsRouter() {
  return createRouter(listingsHandlers)
}
