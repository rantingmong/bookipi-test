import {
  APIGatewayAuthorizerResult,
  APIGatewayRequestAuthorizerEvent,
} from 'aws-lambda'

export function header(event: APIGatewayRequestAuthorizerEvent, name: string) {
  const headers = event.headers
  if (!headers) return undefined
  const entry = Object.entries(headers).find(
    ([key]) => key.toLowerCase() === name.toLowerCase(),
  )
  if (!entry || typeof entry[1] !== 'string') return undefined
  return entry[1]
}

export function toHeaders(event: APIGatewayRequestAuthorizerEvent) {
  const headers = new Headers()
  for (const [key, value] of Object.entries(event.headers ?? {})) {
    if (typeof value === 'string') headers.set(key, value)
  }
  return headers
}

export function makePolicy(
  event: APIGatewayRequestAuthorizerEvent,
  effect: 'Allow' | 'Deny',
  principalId: string,
  customerId?: string,
): APIGatewayAuthorizerResult {
  const result: APIGatewayAuthorizerResult = {
    principalId,
    policyDocument: {
      Version: '2012-10-17',
      Statement: [
        {
          Action: 'execute-api:Invoke',
          Effect: effect,
          Resource: event.methodArn,
        },
      ],
    },
  }
  if (customerId) result.context = { customerId }
  return result
}
