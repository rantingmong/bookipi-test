import { SendMessageCommand } from '@aws-sdk/client-sqs'
import type { APIGatewayProxyEvent } from 'aws-lambda'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RuntimeClients } from './types.js'
import { handler } from './local-handler.js'
import { getClients, getLocalAuthRuntime } from './runtime.js'

const { getClientsMock, getLocalAuthRuntimeMock } = vi.hoisted(() => ({
  getClientsMock: vi.fn(),
  getLocalAuthRuntimeMock: vi.fn(),
}))

vi.mock('./runtime.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./runtime.js')>()
  return {
    ...actual,
    getClients: getClientsMock,
    getLocalAuthRuntime: getLocalAuthRuntimeMock,
  }
})

const storefrontOrigin = 'http://bookipi.localhost:3200'
const orderId = '00000000-0000-4000-8000-000000000001'
const queueUrl = 'http://localstack:4566/000000000000/bookipi-order-events'
const cookie = 'better-auth.session_token=opaque-session'
const evalMock = vi.fn(async (..._arguments: unknown[]) => [
  'RESERVED',
  orderId,
  'sale-1:slot:0001',
])
const sendMock = vi.fn().mockResolvedValue({})
const readSession = vi.fn()

function request(
  input: {
    origin?: string
    cookie?: string
    customerId?: string
    body?: string
  } = {},
): APIGatewayProxyEvent {
  const headers: Record<string, string> = {}
  if (input.origin) headers.Origin = input.origin
  if (input.cookie) headers.Cookie = input.cookie
  if (input.customerId) headers['X-Customer-Id'] = input.customerId
  return {
    body: input.body ?? '{"listingId":"sale-1","idempotencyKey":"key-1"}',
    headers,
    multiValueHeaders: {},
    httpMethod: 'POST',
    isBase64Encoded: false,
    path: '/api/checkout',
    pathParameters: null,
    queryStringParameters: null,
    stageVariables: null,
    resource: '/api/checkout',
    requestContext: {
      authorizer: {
        customerId: input.customerId ?? 'spoofed-context-customer',
      },
    },
  } as unknown as APIGatewayProxyEvent
}

function configureRuntime(): void {
  const clients = {
    valkey: { eval: evalMock },
    sqs: { send: sendMock },
    queueUrl,
  } as unknown as RuntimeClients
  getClientsMock.mockReturnValue(clients)
  getLocalAuthRuntimeMock.mockReturnValue({ getSession: readSession })
}

describe('local Hobby checkout adapter', () => {
  beforeEach(() => {
    vi.stubEnv('STOREFRONT_ORIGIN', storefrontOrigin)
    vi.stubEnv('BETTER_AUTH_URL', storefrontOrigin)
    vi.stubEnv('BETTER_AUTH_SECRET', 'test-secret')
    vi.stubEnv('VALKEY_URL', 'redis://valkey:6379')
    vi.stubEnv('ORDER_EVENTS_QUEUE_URL', queueUrl)
    evalMock.mockReset()
    evalMock.mockResolvedValue(['RESERVED', orderId, 'sale-1:slot:0001'])
    sendMock.mockReset()
    sendMock.mockResolvedValue({})
    readSession.mockReset()
    getClientsMock.mockReset()
    getLocalAuthRuntimeMock.mockReset()
    configureRuntime()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('checks the exact origin before it reads the session', async () => {
    await expect(
      handler(request({ origin: 'http://evil.example', cookie })),
    ).resolves.toMatchObject({
      statusCode: 401,
      body: JSON.stringify({ error: 'UNAUTHENTICATED' }),
    })
    expect(getLocalAuthRuntime).not.toHaveBeenCalled()
    expect(readSession).not.toHaveBeenCalled()
    expect(getClients).not.toHaveBeenCalled()
    expect(evalMock).not.toHaveBeenCalled()
    expect(sendMock).not.toHaveBeenCalled()
  })

  it.each([undefined, ''])('denies a missing cookie', async (sessionCookie) => {
    await expect(
      handler(request({ origin: storefrontOrigin, cookie: sessionCookie })),
    ).resolves.toMatchObject({ statusCode: 401 })
    expect(getLocalAuthRuntime).toHaveBeenCalledOnce()
    expect(getLocalAuthRuntime).toHaveBeenCalledWith()
    expect(readSession).not.toHaveBeenCalled()
    expect(getClients).not.toHaveBeenCalled()
  })

  it('denies an invalid session before it reaches checkout or SQS', async () => {
    readSession.mockResolvedValue(null)

    await expect(
      handler(request({ origin: storefrontOrigin, cookie })),
    ).resolves.toMatchObject({
      statusCode: 401,
      body: JSON.stringify({ error: 'UNAUTHENTICATED' }),
    })
    expect(readSession).toHaveBeenCalledOnce()
    expect(getLocalAuthRuntime).toHaveBeenCalledOnce()
    expect(getLocalAuthRuntime).toHaveBeenCalledWith()
    expect(getClients).not.toHaveBeenCalled()
    expect(evalMock).not.toHaveBeenCalled()
    expect(sendMock).not.toHaveBeenCalled()
  })

  it('uses the session customer and ignores spoofed identity fields', async () => {
    readSession.mockResolvedValue({ user: { id: 'verified-customer' } })

    await expect(
      handler(
        request({
          origin: storefrontOrigin,
          cookie,
          customerId: 'browser-customer',
        }),
      ),
    ).resolves.toMatchObject({
      statusCode: 202,
      body: JSON.stringify({
        orderId,
        status: 'PENDING',
        redirectUrl: `/payment?orderId=${orderId}`,
      }),
    })

    const evalArguments = evalMock.mock.calls[0]
    expect(evalArguments?.slice(7, 9)).toEqual(['verified-customer', 'sale-1'])
    const command = sendMock.mock.calls[0]?.[0] as SendMessageCommand
    expect(JSON.parse(command.input.MessageBody ?? '')).toMatchObject({
      customerId: 'verified-customer',
      listingId: 'sale-1',
    })
  })

  it('returns a safe retryable response when session infrastructure fails', async () => {
    readSession.mockRejectedValue(new Error('private storage detail'))

    await expect(
      handler(request({ origin: storefrontOrigin, cookie })),
    ).resolves.toMatchObject({
      statusCode: 503,
      body: JSON.stringify({ error: 'CHECKOUT_RETRYABLE' }),
    })
    expect(getClients).not.toHaveBeenCalled()
  })

  it('returns a safe retryable response when checkout infrastructure fails', async () => {
    readSession.mockResolvedValue({ user: { id: 'verified-customer' } })
    sendMock.mockRejectedValue(new Error('private queue detail'))

    await expect(
      handler(request({ origin: storefrontOrigin, cookie })),
    ).resolves.toMatchObject({
      statusCode: 503,
      body: JSON.stringify({ error: 'CHECKOUT_RETRYABLE' }),
    })
    expect(evalMock).toHaveBeenCalledOnce()
    expect(sendMock).toHaveBeenCalledOnce()
  })
})
