import { orderInputSchema } from '#features/order/schema'
export { orderInputSchema }
export { orderStatuses } from '#features/order/constants'

export function parseOrder(input: unknown) {
  return orderInputSchema.parse(input)
}
