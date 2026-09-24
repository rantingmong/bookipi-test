import { SendMessageCommand } from '@aws-sdk/client-sqs'
import type { APIGatewayProxyEvent } from 'aws-lambda'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RuntimeClients } from './types.js'
import { handler } from './handler.js'
import { getClients } from './runtime.js'

const { getClientsMock } = vi.hoisted(() => ({ getClientsMock: vi.fn() }))

vi.mock('./runtime.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./runtime.js')>()
  return { ...actual, getClients: getClientsMock }
})

const orderId = '00000000-0000-4000-8000-000000000001'
const queueUrl = 'https://sqs.example.test/orders'
const evalMock = vi.fn(async (..._arguments: unknown[]) => [
  'RESERVED',
  orderId,
  'sale-1:slot:0001',
])
const sendMock = vi.fn().mockResolvedValue({})

function request(
  body: string | null,
  customerId?: unknown,
  isBase64Encoded = false,
): APIGatewayProxyEvent {
  let authorizer: Record<string, unknown> | undefined
  if (customerId !== undefined) {
    authorizer = { customerId }
  }
  return {
    body,
    isBase64Encoded,
    requestContext: { authorizer },
  } as APIGatewayProxyEvent
}

function configureClients(): void {
  const clients = {
    valkey: { eval: evalMock },
    sqs: { send: sendMock },
    queueUrl,
  } as unknown as RuntimeClients
  vi.mocked(getClients).mockReturnValue(clients)
}

describe('checkout Lambda REST handler', () => {
  beforeEach(() => {
    evalMock.mockReset()
    evalMock.mockResolvedValue(['RESERVED', orderId, 'sale-1:slot:0001'])
    sendMock.mockReset()
    sendMock.mockResolvedValue({})
    vi.mocked(getClients).mockReset()
    configureClients()
  })

  it('returns 202 and calls Valkey and SQS for a valid authenticated request', async () => {
    await expect(
      handler(
        request(
          '{"listingId":"sale-1","idempotencyKey":"key-1"}',
          'customer-1',
        ),
      ),
    ).resolves.toMatchObject({
      statusCode: 202,
      body: JSON.stringify({
        orderId,
        status: 'PENDING',
        redirectUrl: `/payment?orderId=${orderId}`,
      }),
    })

    expect(evalMock).toHaveBeenCalledOnce()
    const evalArguments = evalMock.mock.calls[0]
    expect(evalArguments?.[1]).toBe(5)
    expect(evalArguments?.slice(2, 7)).toEqual([
      'sale:{sale-1}:meta',
      'sale:{sale-1}:available-slots',
      'sale:{sale-1}:idempotency',
      'sale:{sale-1}:active-customers',
      'sale:{sale-1}:orders',
    ])
    expect(evalArguments?.slice(7, 9)).toEqual(['customer-1', 'sale-1'])
    expect(evalArguments?.[9]).toMatch(/^[0-9a-f-]{36}$/)
    expect(evalArguments?.slice(10)).toEqual(['customer-1', 'key-1'])

    expect(sendMock).toHaveBeenCalledOnce()
    const command = sendMock.mock.calls[0]?.[0] as SendMessageCommand
    expect(command).toBeInstanceOf(SendMessageCommand)
    expect(command.input.QueueUrl).toBe(queueUrl)
    expect(JSON.parse(command.input.MessageBody ?? '')).toEqual({
      eventType: 'order-reserved.v1',
      orderId,
      customerId: 'customer-1',
      listingId: 'sale-1',
      slotId: 'sale-1:slot:0001',
    })
  })

  it('rejects a request without trusted authorizer identity', async () => {
    vi.mocked(getClients).mockImplementation(() => {
      throw new Error('Runtime settings are unavailable')
    })

    await expect(
      handler(
        request(
          '{"listingId":"sale-1","idempotencyKey":"key-1","customerId":"browser"}',
        ),
      ),
    ).resolves.toMatchObject({
      statusCode: 401,
      body: JSON.stringify({ error: 'UNAUTHENTICATED' }),
    })
    expect(getClients).not.toHaveBeenCalled()
    expect(evalMock).not.toHaveBeenCalled()
    expect(sendMock).not.toHaveBeenCalled()
  })

  it('returns a stable error for malformed JSON and invalid fields', async () => {
    vi.mocked(getClients).mockImplementation(() => {
      throw new Error('Runtime settings are unavailable')
    })

    await expect(handler(request('{', 'customer-1'))).resolves.toMatchObject({
      statusCode: 400,
      body: JSON.stringify({ error: 'INVALID_REQUEST' }),
    })
    await expect(
      handler(
        request('{"listingId":"","idempotencyKey":"key-1"}', 'customer-1'),
      ),
    ).resolves.toMatchObject({
      statusCode: 400,
      body: JSON.stringify({ error: 'INVALID_REQUEST' }),
    })
    expect(getClients).not.toHaveBeenCalled()
    expect(evalMock).not.toHaveBeenCalled()
    expect(sendMock).not.toHaveBeenCalled()
  })

  it.each([
    ['unpublished', 'UNPUBLISHED', 'LISTING_UNPUBLISHED'],
    ['closed', 'CLOSED', 'SALE_CLOSED'],
    ['sold out', 'SOLD_OUT', 'SOLD_OUT'],
    ['already active', 'ALREADY_ACTIVE', 'ACTIVE_ORDER_EXISTS'],
    ['cancelled', 'CANCELLED', 'RESERVATION_CANCELLED'],
  ])(
    'maps a %s reservation result to a conflict',
    async (_label, status, error) => {
      evalMock.mockResolvedValue([status])

      await expect(
        handler(
          request(
            '{"listingId":"sale-1","idempotencyKey":"key-1"}',
            'customer-1',
          ),
        ),
      ).resolves.toMatchObject({
        statusCode: 409,
        body: JSON.stringify({ error }),
      })
      expect(evalMock).toHaveBeenCalledOnce()
      expect(sendMock).not.toHaveBeenCalled()
    },
  )

  it('returns a retryable service error when a dependency fails', async () => {
    sendMock.mockRejectedValue(new Error('private dependency detail'))

    await expect(
      handler(
        request(
          '{"listingId":"sale-1","idempotencyKey":"key-1"}',
          'customer-1',
        ),
      ),
    ).resolves.toMatchObject({
      statusCode: 503,
      body: JSON.stringify({ error: 'CHECKOUT_RETRYABLE' }),
    })
    expect(evalMock).toHaveBeenCalledOnce()
    expect(sendMock).toHaveBeenCalledOnce()
  })

  it('returns a retryable service error when runtime clients fail to initialize', async () => {
    vi.mocked(getClients).mockImplementation(() => {
      throw new Error('Runtime settings are invalid')
    })

    await expect(
      handler(
        request(
          '{"listingId":"sale-1","idempotencyKey":"key-1"}',
          'customer-1',
        ),
      ),
    ).resolves.toMatchObject({
      statusCode: 503,
      body: JSON.stringify({ error: 'CHECKOUT_RETRYABLE' }),
    })
    expect(evalMock).not.toHaveBeenCalled()
    expect(sendMock).not.toHaveBeenCalled()
  })
})
