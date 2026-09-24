import { APIGatewayProxyEvent } from 'aws-lambda'

export function trustedCustomerId(
  event: APIGatewayProxyEvent,
): string | undefined {
  const authorizer = event.requestContext.authorizer
  if (!authorizer) {
    return undefined
  }

  const customerId = (authorizer as Record<string, unknown>).customerId
  if (typeof customerId !== 'string' || customerId.trim().length === 0) {
    return undefined
  }

  return customerId
}
