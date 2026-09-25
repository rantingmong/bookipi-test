import { describe, expect, it } from 'vitest'
import {
  readEnvConfig,
  readListingSeedEnvConfig,
  readListingSeedOverrides,
  readMongoEnvConfig,
  readOrderWorkerEnvConfig,
} from '#features/env/feature'

const environment = {
  BETTER_AUTH_URL: 'http://localhost:3001',
  BETTER_AUTH_SECRET: 'local-test-secret',
  MONGODB_URI: 'mongodb://localhost:27017',
  MONGODB_DATABASE: 'bookipi',
  VALKEY_URL: 'redis://localhost:6379',
}

describe('environment feature', () => {
  it('validates MongoDB settings with the existing field mapping', () => {
    expect(
      readMongoEnvConfig({
        MONGODB_URI: environment.MONGODB_URI,
        MONGODB_DATABASE: environment.MONGODB_DATABASE,
      }),
    ).toEqual({
      mongoUri: environment.MONGODB_URI,
      mongoDatabase: environment.MONGODB_DATABASE,
    })
    expect(
      readMongoEnvConfig({
        MONGODB_URI: ` ${environment.MONGODB_URI} `,
        MONGODB_DATABASE: ` ${environment.MONGODB_DATABASE} `,
      }),
    ).toEqual({
      mongoUri: ` ${environment.MONGODB_URI} `,
      mongoDatabase: ` ${environment.MONGODB_DATABASE} `,
    })
  })

  it('validates the MongoDB and SQS worker settings', () => {
    expect(
      readOrderWorkerEnvConfig({
        MONGODB_URI: environment.MONGODB_URI,
        MONGODB_DATABASE: environment.MONGODB_DATABASE,
        AWS_REGION: 'ap-southeast-1',
        SQS_QUEUE_URL: 'https://sqs.example/order-events',
      }),
    ).toEqual({
      mongoUri: environment.MONGODB_URI,
      mongoDatabase: environment.MONGODB_DATABASE,
      awsRegion: 'ap-southeast-1',
      sqsQueueUrl: 'https://sqs.example/order-events',
      sqsEndpointUrl: undefined,
    })
    expect(
      readOrderWorkerEnvConfig({
        MONGODB_URI: environment.MONGODB_URI,
        MONGODB_DATABASE: environment.MONGODB_DATABASE,
        AWS_REGION: 'ap-southeast-1',
        SQS_QUEUE_URL: 'http://localstack:4566/000000000000/order-events',
        SQS_ENDPOINT_URL: 'http://localstack:4566',
      }).sqsEndpointUrl,
    ).toBe('http://localstack:4566')
    expect(() =>
      readOrderWorkerEnvConfig({
        MONGODB_URI: environment.MONGODB_URI,
        MONGODB_DATABASE: environment.MONGODB_DATABASE,
        AWS_REGION: 'ap-southeast-1',
      }),
    ).toThrow('Missing required environment variable SQS_QUEUE_URL')
  })

  it('accepts a dynamic sale window and listing ID for integration fixtures', () => {
    expect(
      readListingSeedOverrides({
        DEMO_LISTING_ID: 'integration-sale',
        DEMO_SALE_STARTS_AT: '2026-09-25T00:00:00.000Z',
        DEMO_SALE_ENDS_AT: '2026-09-26T00:00:00.000Z',
      }),
    ).toEqual({
      listingId: 'integration-sale',
      saleStartsAt: '2026-09-25T00:00:00.000Z',
      saleEndsAt: '2026-09-26T00:00:00.000Z',
    })
  })

  it('requires MongoDB and Valkey settings for the seed command', () => {
    expect(
      readListingSeedEnvConfig({
        MONGODB_URI: environment.MONGODB_URI,
        MONGODB_DATABASE: environment.MONGODB_DATABASE,
        VALKEY_URL: environment.VALKEY_URL,
      }),
    ).toEqual({
      mongoUri: environment.MONGODB_URI,
      mongoDatabase: environment.MONGODB_DATABASE,
      valkeyUrl: environment.VALKEY_URL,
    })
    expect(() =>
      readListingSeedEnvConfig({
        MONGODB_URI: environment.MONGODB_URI,
        MONGODB_DATABASE: environment.MONGODB_DATABASE,
      }),
    ).toThrow('Missing required environment variable VALKEY_URL')
  })

  it('validates required settings and accepts only an exact optional storefront origin', () => {
    expect(readEnvConfig(environment)).toMatchObject({
      authUrl: environment.BETTER_AUTH_URL,
      authSecret: environment.BETTER_AUTH_SECRET,
      mongoUri: environment.MONGODB_URI,
      mongoDatabase: environment.MONGODB_DATABASE,
      valkeyUrl: environment.VALKEY_URL,
    })
    expect(() =>
      readEnvConfig({ ...environment, MONGODB_DATABASE: '' }),
    ).toThrow('Missing required environment variable MONGODB_DATABASE')
    expect(() =>
      readEnvConfig({
        ...environment,
        BETTER_AUTH_URL: 'http://localhost:3001/api/auth',
      }),
    ).toThrow('BETTER_AUTH_URL must be an HTTP or HTTPS origin without a path')
    expect(() =>
      readEnvConfig({
        ...environment,
        STOREFRONT_ORIGIN: 'https://store.example.test/path',
      }),
    ).toThrow('STOREFRONT_ORIGIN must be an exact origin without a path')
    expect(
      readEnvConfig({
        ...environment,
        STOREFRONT_ORIGIN: 'https://store.example.test',
      }).storefrontOrigin,
    ).toBe('https://store.example.test')
  })
})
