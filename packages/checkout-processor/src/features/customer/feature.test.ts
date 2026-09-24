import type { APIGatewayProxyEvent } from 'aws-lambda'
import { describe, expect, it } from 'vitest'
import { trustedCustomerId } from './feature.js'

function event(authorizer: unknown): APIGatewayProxyEvent {
  return {
    requestContext: { authorizer },
  } as APIGatewayProxyEvent
}

describe('customer feature', () => {
  it('returns the trusted authorizer customer ID', () => {
    expect(trustedCustomerId(event({ customerId: 'customer-1' }))).toBe(
      'customer-1',
    )
  })

  it.each([
    ['missing authorizer', undefined],
    ['missing customer ID', {}],
    ['non-string customer ID', { customerId: 42 }],
    ['empty customer ID', { customerId: '' }],
    ['whitespace-only customer ID', { customerId: ' \t\n ' }],
  ])('rejects a %s', (_name, authorizer) => {
    expect(trustedCustomerId(event(authorizer))).toBeUndefined()
  })
})
