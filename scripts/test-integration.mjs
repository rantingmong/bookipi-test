import { spawn } from 'node:child_process'
import { randomBytes, randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { setTimeout as delay } from 'node:timers/promises'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const prepareK6 = process.argv.slice(2).includes('--prepare-k6')
let k6AvailableUnits = 20
if (prepareK6 && process.env.K6_AVAILABLE_UNITS) {
  k6AvailableUnits = Number(process.env.K6_AVAILABLE_UNITS)
}
if (prepareK6 && ![20, 40, 80].includes(k6AvailableUnits)) {
  throw new Error('K6_AVAILABLE_UNITS must be 20, 40, or 80')
}
let browserOrigin = process.env.LOCAL_BROWSER_ORIGIN
if (!browserOrigin) browserOrigin = 'http://bookipi.localhost:3200'
let tokenFile = process.env.LOCALSTACK_TOKEN_FILE
if (!tokenFile) tokenFile = '.localstack'
const tokenPath = resolve(root, tokenFile)
let authToken = ''
try {
  authToken = (await readFile(tokenPath, 'utf8')).trim()
} catch {
  throw new Error('Create .localstack with the LocalStack auth token first')
}
if (!authToken) throw new Error('The .localstack token file is empty')

const authSecret = randomBytes(32).toString('base64url')
const invalidSessionCookie = `better-auth.session_token=${randomBytes(16).toString('hex')}`
const secretsToRedact = [authToken, authSecret, invalidSessionCookie]
const listingId = `integration-${Date.now()}`
let saleStartsAt = new Date(Date.now() - 60_000).toISOString()
let saleEndsAt = new Date(Date.now() + 3_600_000).toISOString()
const queueUrl = 'http://localstack:4566/000000000000/bookipi-order-events'
const composeEnvironment = {
  ...process.env,
  AWS_REGION: 'ap-southeast-1',
  LOCALSTACK_AUTH_TOKEN: authToken,
  BETTER_AUTH_SECRET: authSecret,
  LOCAL_BROWSER_ORIGIN: browserOrigin,
  NEXT_PUBLIC_LISTING_ID: listingId,
}
const compose = ['compose', '-f', 'infra/compose.yml']
let sessionCookie = ''

function redact(value) {
  let safeValue = value
  for (const secret of [...secretsToRedact, sessionCookie]) {
    if (secret) safeValue = safeValue.split(secret).join('[redacted]')
  }
  return safeValue
}

function run(command, args, options = {}) {
  return new Promise((resolvePromise, rejectPromise) => {
    const { input, ...spawnOptions } = options
    let stdinMode = 'ignore'
    if (input !== undefined) stdinMode = 'pipe'
    const child = spawn(command, args, {
      cwd: root,
      env: process.env,
      stdio: [stdinMode, 'pipe', 'pipe'],
      ...spawnOptions,
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString()
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })
    child.on('error', rejectPromise)
    child.on('close', (code) => {
      if (code === 0) {
        resolvePromise({ stdout, stderr })
        return
      }
      rejectPromise(
        new Error(
          `${command} failed with code ${code}: ${redact(stderr || stdout)}`,
        ),
      )
    })
    if (input !== undefined && child.stdin) child.stdin.end(input)
  })
}

async function composeRun(args, options = {}) {
  return run('docker', [...compose, ...args], {
    ...options,
    env: composeEnvironment,
  })
}

async function waitFor(description, check, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs
  let lastError = 'No response'
  while (Date.now() < deadline) {
    try {
      const result = await check()
      if (result) return result
    } catch (error) {
      if (error instanceof Error) lastError = redact(error.message)
    }
    await delay(1500)
  }
  throw new Error(`Timed out waiting for ${description}: ${lastError}`)
}

async function request(path, options = {}) {
  return fetch(new URL(path, browserOrigin), options)
}

async function expectJson(response, description) {
  const body = await response.text()
  let value
  try {
    value = JSON.parse(body)
  } catch {
    throw new Error(
      `${description} returned non-JSON status ${response.status}`,
    )
  }
  if (!response.ok)
    throw new Error(`${description} returned HTTP ${response.status}`)
  return value
}

async function localStack(args) {
  return composeRun(['exec', '-T', 'localstack', 'awslocal', ...args])
}

async function mongoEval(script) {
  return composeRun([
    'exec',
    '-T',
    'mongodb',
    'mongosh',
    'mongodb://mongodb:27017/bookipi?replicaSet=rs0',
    '--quiet',
    '--eval',
    script,
  ])
}

async function valkeyCommand(...args) {
  const result = await composeRun([
    'exec',
    '-T',
    'valkey',
    'valkey-cli',
    '--raw',
    ...args,
  ])
  return result.stdout.trim()
}

async function deployLocalStack() {
  const headResult = await localStack([
    's3api',
    'head-bucket',
    '--bucket',
    'bookipi-local-artifacts',
  ]).catch(() => undefined)
  if (!headResult) {
    await localStack([
      's3api',
      'create-bucket',
      '--bucket',
      'bookipi-local-artifacts',
      '--create-bucket-configuration',
      'LocationConstraint=ap-southeast-1',
    ])
  }

  await composeRun([
    'exec',
    '-T',
    'localstack',
    'awslocal',
    's3',
    'cp',
    '/workspace/.artifacts/lambdas/checkout-processor.zip',
    's3://bookipi-local-artifacts/checkout-processor.zip',
  ])

  await composeRun([
    'exec',
    '-T',
    'localstack',
    'sh',
    '-c',
    'awslocal cloudformation deploy --template-file /workspace/infra/localstack/template.yaml --stack-name bookipi-local-stack --capabilities CAPABILITY_IAM --parameter-overrides "BetterAuthSecret=$BETTER_AUTH_SECRET"',
  ])
}

async function runSeed(overrides = {}) {
  const args = ['run', '--rm', '-T']
  const seedConfig = {
    DEMO_LISTING_ID: listingId,
    DEMO_SALE_STARTS_AT: saleStartsAt,
    DEMO_SALE_ENDS_AT: saleEndsAt,
    ...overrides,
  }
  for (const [key, value] of Object.entries(seedConfig)) {
    args.push('-e', `${key}=${value}`)
  }
  args.push('backend', 'pnpm', '--filter', '@bookipi/backend', 'seed')
  return composeRun(args)
}

async function readSeedSnapshot() {
  const listing = await mongoEval(
    `const id = '${listingId}'; const row = db.listings.findOne({listingId: id}); const slots = db.getCollection('listing-slots').find({listingId: id}).sort({slotId: 1}).toArray(); print(JSON.stringify({listingId: row && row.listingId, productName: row && row.productName, saleStartsAt: row && row.saleStartsAt.toISOString(), saleEndsAt: row && row.saleEndsAt.toISOString(), reserveSlots: row && row.reserveSlots, slotIds: slots.map((slot) => slot.slotId), slotStates: slots.map((slot) => slot.state), orderCount: db.orders.countDocuments({listingId: id})}));`,
  )
  const metaKey = `sale:{${listingId}}:meta`
  const slotsKey = `sale:{${listingId}}:available-slots`
  const availableSlotsOutput = await valkeyCommand(
    'LRANGE',
    slotsKey,
    '0',
    '-1',
  )
  const snapshot = {
    database: JSON.parse(listing.stdout.trim()),
    published: await valkeyCommand('HGET', metaKey, 'published'),
    seedCount: await valkeyCommand('HGET', metaKey, 'seedCount'),
    availableSlots: availableSlotsOutput
      ? availableSlotsOutput.split(/\r?\n/)
      : [],
  }
  return snapshot
}

async function runGate(number, description, check) {
  try {
    await check()
    process.stdout.write(`GATE ${number} PASS ${description}\n`)
  } catch (error) {
    const message =
      error instanceof Error ? redact(error.message) : 'Unknown error'
    process.stderr.write(`GATE ${number} FAIL ${message}\n`)
    throw new Error(`Gate ${number} failed`)
  }
}

async function waitForWorkerOrder(orderId) {
  return waitFor('worker persistence', async () => {
    const result = await mongoEval(
      `const row = db.orders.findOne({orderId: '${orderId}'}); print(JSON.stringify(row && {orderId: row.orderId, customerId: row.customerId, listingId: row.listingId, slotId: row.slotId, status: row.status}));`,
    )
    if (result.stdout.trim() === 'null') return undefined
    return JSON.parse(result.stdout.trim())
  })
}

async function checkWorkerQueue() {
  const orderId = randomUUID()
  const event = {
    eventType: 'order-reserved.v1',
    orderId,
    customerId: 'local-worker-proof',
    listingId,
    slotId: `${listingId}:worker-proof-slot`,
  }
  try {
    await localStack([
      'sqs',
      'send-message',
      '--queue-url',
      queueUrl,
      '--message-body',
      JSON.stringify(event),
    ])
    const persisted = await waitForWorkerOrder(orderId)
    if (
      persisted.orderId !== orderId ||
      persisted.customerId !== event.customerId ||
      persisted.status !== 'PENDING'
    ) {
      throw new Error('Backend worker persisted incorrect order facts')
    }
    await waitFor('worker message acknowledgement', async () => {
      const result = await localStack([
        'sqs',
        'get-queue-attributes',
        '--queue-url',
        queueUrl,
        '--attribute-names',
        'ApproximateNumberOfMessages',
        'ApproximateNumberOfMessagesNotVisible',
      ])
      const attributes = JSON.parse(result.stdout).Attributes
      return (
        attributes.ApproximateNumberOfMessages === '0' &&
        attributes.ApproximateNumberOfMessagesNotVisible === '0'
      )
    })
  } finally {
    await mongoEval(`db.orders.deleteOne({orderId: '${orderId}'})`).catch(
      () => undefined,
    )
  }
}

async function readLambdaMarkerCount(functionName, marker) {
  try {
    const result = await localStack([
      'logs',
      'filter-log-events',
      '--log-group-name',
      `/aws/lambda/${functionName}`,
      '--filter-pattern',
      `"${marker}"`,
      '--query',
      'length(events)',
      '--output',
      'text',
    ])
    const count = Number.parseInt(result.stdout.trim(), 10)
    if (Number.isNaN(count)) return 0
    return count
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes('ResourceNotFoundException')
    ) {
      return 0
    }
    throw error
  }
}

async function invokeProcessorDirectly(cookie, body) {
  const suffix = randomUUID()
  const eventPath = `/tmp/bookipi-processor-event-${suffix}.json`
  const resultPath = `/tmp/bookipi-processor-result-${suffix}.json`
  const event = {
    body: JSON.stringify(body),
    headers: {
      Origin: browserOrigin,
      Cookie: cookie,
      'Content-Type': 'application/json',
      'X-Customer-Id': 'local-spoofed-header',
    },
    multiValueHeaders: { Cookie: [cookie] },
    httpMethod: 'POST',
    isBase64Encoded: false,
    resource: '/api/checkout',
    path: '/api/checkout',
    requestContext: {
      accountId: '000000000000',
      apiId: 'bookipi-checkout',
      stage: 'local',
      requestId: randomUUID(),
      identity: { sourceIp: '127.0.0.1', userAgent: 'local-integration' },
      resourcePath: '/api/checkout',
      httpMethod: 'POST',
      path: '/local/api/checkout',
      authorizer: { customerId: 'local-spoofed-customer', role: 'spoofed' },
    },
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    pathParameters: null,
    stageVariables: null,
  }
  const writeEvent =
    "const chunks = []; process.stdin.on('data', (chunk) => chunks.push(chunk)); process.stdin.on('end', () => require('node:fs').writeFileSync(process.argv[1], Buffer.concat(chunks)))"
  try {
    await composeRun(
      ['exec', '-T', 'localstack', 'node', '-e', writeEvent, eventPath],
      { input: JSON.stringify(event) },
    )
    await composeRun([
      'exec',
      '-T',
      'localstack',
      'awslocal',
      'lambda',
      'invoke',
      '--function-name',
      'bookipi-checkout-processor',
      '--payload',
      `fileb://${eventPath}`,
      resultPath,
    ])
    const readResult = `const fs = require('node:fs'); const result = JSON.parse(fs.readFileSync('${resultPath}', 'utf8')); let body = {}; try { body = JSON.parse(result.body) } catch {} const safe = {statusCode: result.statusCode, error: body.error, orderId: body.orderId, status: body.status}; process.stdout.write(JSON.stringify(safe))`
    const result = await composeRun([
      'exec',
      '-T',
      'localstack',
      'node',
      '-e',
      readResult,
    ])
    return JSON.parse(result.stdout)
  } finally {
    const cleanup = `for (const path of ['${eventPath}', '${resultPath}']) { try { require('node:fs').unlinkSync(path) } catch {} }`
    await composeRun(['exec', '-T', 'localstack', 'node', '-e', cleanup]).catch(
      () => undefined,
    )
  }
}

function safeGatewayBodyCode(body) {
  const allowedCodes = new Set([
    'Unauthorized',
    'UNAUTHENTICATED',
    'Forbidden',
    'Missing Authentication Token',
    'AUTHORIZER_CONFIGURATION_ERROR',
    'Internal server error',
  ])
  let value
  try {
    const parsed = JSON.parse(body)
    value = parsed.code
    if (!value) value = parsed.error
    if (!value) value = parsed.message
  } catch {
    value = body.trim()
  }
  if (typeof value !== 'string') return 'non-json'
  if (!allowedCodes.has(value)) return 'other'
  return value
}

async function createSession() {
  const email = `local-${Date.now()}-${randomUUID()}@example.test`
  const signUpResponse = await request('/api/auth/sign-up/email', {
    method: 'POST',
    headers: { origin: browserOrigin, 'content-type': 'application/json' },
    body: JSON.stringify({
      name: 'Local Integration User',
      email,
      password: 'Integration-password-24',
    }),
  })
  if (!signUpResponse.ok) {
    throw new Error(
      `Unified-origin sign-up returned HTTP ${signUpResponse.status}`,
    )
  }
  const setCookies = signUpResponse.headers.getSetCookie()
  if (setCookies.length === 0) {
    throw new Error('Sign-up did not create a session cookie')
  }
  sessionCookie = setCookies.map((value) => value.split(';', 1)[0]).join('; ')

  const session = await expectJson(
    await request('/api/auth/get-session', {
      headers: { cookie: sessionCookie },
    }),
    'Better Auth session read',
  )
  const customerId = session.user?.id
  if (typeof customerId !== 'string' || customerId.length === 0) {
    throw new Error('Better Auth session did not include a user ID')
  }
  return customerId
}

async function waitForLambdaMarker(functionName, marker, previousCount, label) {
  return waitFor(label, async () => {
    const count = await readLambdaMarkerCount(functionName, marker)
    if (count > previousCount) return count
    return undefined
  })
}

async function runAcceptanceGates() {
  await runGate(
    1,
    'backend health at /api/system/health through Caddy',
    async () => {
      const response = await request('/api/system/health')
      const health = await expectJson(response, 'Backend health')
      if (health.status !== 'ok') throw new Error('Backend health is not ok')
    },
  )

  await runGate(
    2,
    'backend worker consumes, persists, and acknowledges SQS',
    async () => {
      await checkWorkerQueue()
    },
  )

  await runGate(
    3,
    'backend seed is idempotent and rejects conflicting facts',
    async () => {
      await runSeed()
      const firstSnapshot = await readSeedSnapshot()
      await runSeed()
      const secondSnapshot = await readSeedSnapshot()
      const expectedSlotIds = Array.from(
        { length: 10 },
        (_unused, index) =>
          `${listingId}:slot:${String(index + 1).padStart(4, '0')}`,
      )
      if (
        firstSnapshot.database.listingId !== listingId ||
        firstSnapshot.database.slotIds.length !== 10 ||
        firstSnapshot.database.slotIds.some(
          (slotId, index) => slotId !== expectedSlotIds[index],
        ) ||
        firstSnapshot.database.slotStates.some(
          (state) => state !== 'available',
        ) ||
        firstSnapshot.database.orderCount !== 0 ||
        firstSnapshot.published !== '1' ||
        firstSnapshot.seedCount !== '10' ||
        firstSnapshot.availableSlots.length !== expectedSlotIds.length ||
        firstSnapshot.availableSlots.some(
          (slotId, index) => slotId !== expectedSlotIds[index],
        )
      ) {
        throw new Error(
          `Seed state mismatch: listing=${firstSnapshot.database.listingId === listingId}, slots=${firstSnapshot.database.slotIds.length}, states=${firstSnapshot.database.slotStates.length}, published=${firstSnapshot.published}, seedCount=${firstSnapshot.seedCount}, available=${firstSnapshot.availableSlots.length}`,
        )
      }
      if (JSON.stringify(firstSnapshot) !== JSON.stringify(secondSnapshot))
        throw new Error('Repeated seed changed MongoDB or Valkey state')

      const conflict = await runSeed({
        DEMO_SALE_ENDS_AT: new Date(
          Date.parse(saleEndsAt) + 60_000,
        ).toISOString(),
      }).then(
        () => '',
        (error) => (error instanceof Error ? error.message : 'Seed failed'),
      )
      if (!conflict.includes('Existing listing facts conflict with seed'))
        throw new Error('Conflicting seed facts did not fail closed')
      const afterConflict = await readSeedSnapshot()
      if (JSON.stringify(secondSnapshot) !== JSON.stringify(afterConflict))
        throw new Error('Conflicting seed facts changed existing state')
    },
  )

  await runGate(
    4,
    'storefront static contents load through Caddy',
    async () => {
      const response = await request('/')
      if (!response.ok)
        throw new Error(`Storefront returned HTTP ${response.status}`)
      const html = await response.text()
      if (!html.includes('<html'))
        throw new Error('Storefront response is not HTML')
    },
  )

  await runGate(
    5,
    'storefront listing request loads through the unified origin',
    async () => {
      const listing = await expectJson(
        await request(`/api/listings/${listingId}`),
        'Listing read',
      )
      if (listing.listingId !== listingId)
        throw new Error('Listing response has the wrong ID')
    },
  )

  await runGate(
    6,
    'API Gateway data plane returns its expected route response',
    async () => {
      const response = await request('/api/checkout')
      const body = await response.text()
      if (
        response.status !== 403 ||
        !body.includes('Missing Authentication Token')
      )
        throw new Error(
          `API Gateway returned unexpected GET status ${response.status}`,
        )
    },
  )

  await runGate(
    7,
    'API Gateway reaches the combined Lambda and rejects an invalid session',
    async () => {
      const markerBefore = await readLambdaMarkerCount(
        'bookipi-checkout-processor',
        'LOCAL_CHECKOUT_ADAPTER_INVOKED',
      )
      const response = await request('/api/checkout', {
        method: 'POST',
        headers: {
          cookie: invalidSessionCookie,
          origin: browserOrigin,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ listingId, idempotencyKey: randomUUID() }),
      })
      const bodyCode = safeGatewayBodyCode(await response.text())
      if (response.status !== 401 || bodyCode !== 'UNAUTHENTICATED') {
        throw new Error(
          `Invalid session response: status=${response.status}, bodyCode=${bodyCode}`,
        )
      }
      await waitForLambdaMarker(
        'bookipi-checkout-processor',
        'LOCAL_CHECKOUT_ADAPTER_INVOKED',
        markerBefore,
        'API Gateway checkout adapter marker',
      )
    },
  )

  await runGate(
    8,
    'invalid sessions stop before checkout and valid sessions use trusted identity',
    async () => {
      const beforeDeniedRequest = await readSeedSnapshot()
      const denied = await invokeProcessorDirectly(invalidSessionCookie, {
        listingId,
        idempotencyKey: randomUUID(),
      })
      if (denied.statusCode !== 401 || denied.error !== 'UNAUTHENTICATED') {
        throw new Error(
          'Direct invalid-session invocation did not return UNAUTHENTICATED',
        )
      }
      await delay(1_500)
      const afterDeniedRequest = await readSeedSnapshot()
      if (
        JSON.stringify(beforeDeniedRequest) !==
        JSON.stringify(afterDeniedRequest)
      ) {
        throw new Error('Invalid session changed inventory or persisted orders')
      }

      const customerId = await createSession()
      const accepted = await invokeProcessorDirectly(sessionCookie, {
        listingId,
        idempotencyKey: randomUUID(),
      })
      if (accepted.statusCode !== 202 || accepted.status !== 'PENDING') {
        throw new Error(
          'Direct valid-session invocation did not create a pending order',
        )
      }
      const order = await waitForWorkerOrder(accepted.orderId)
      if (
        order.customerId !== customerId ||
        order.listingId !== listingId ||
        order.status !== 'PENDING'
      ) {
        throw new Error(
          'Processor order does not contain the authenticated customer binding',
        )
      }
    },
  )

  await runGate(
    9,
    'same-origin session completes checkout and owner payment flow',
    async () => {
      const customerId = await createSession()
      const adapterMarkerBefore = await readLambdaMarkerCount(
        'bookipi-checkout-processor',
        'LOCAL_CHECKOUT_ADAPTER_INVOKED',
      )

      const checkoutResponse = await request('/api/checkout', {
        method: 'POST',
        headers: {
          cookie: sessionCookie,
          origin: browserOrigin,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ listingId, idempotencyKey: randomUUID() }),
      })
      const checkout = await expectJson(checkoutResponse, 'Checkout')
      if (checkout.status !== 'PENDING' || !checkout.orderId)
        throw new Error('Checkout did not return a pending order')

      await waitForLambdaMarker(
        'bookipi-checkout-processor',
        'LOCAL_CHECKOUT_ADAPTER_INVOKED',
        adapterMarkerBefore,
        'same-origin checkout adapter marker',
      )

      const persisted = await waitForWorkerOrder(checkout.orderId)
      if (
        persisted.customerId !== customerId ||
        persisted.listingId !== listingId ||
        persisted.status !== 'PENDING'
      ) {
        throw new Error('SQS worker persisted incorrect checkout facts')
      }

      const order = await waitFor(
        'owner-visible order persistence',
        async () => {
          const response = await request(`/api/orders/${checkout.orderId}`, {
            headers: { cookie: sessionCookie },
          })
          if (response.status === 404) return undefined
          return expectJson(response, 'Owner order read')
        },
      )
      if (order.status !== 'PENDING')
        throw new Error('Owner order is not pending')

      const paymentResponse = await request(
        `/api/orders/${checkout.orderId}/payment-outcome`,
        {
          method: 'POST',
          headers: {
            cookie: sessionCookie,
            origin: browserOrigin,
            'content-type': 'application/json',
          },
          body: JSON.stringify({ outcome: 'success' }),
        },
      )
      const payment = await expectJson(paymentResponse, 'Owner payment outcome')
      if (payment.status !== 'COMPLETE')
        throw new Error('Owner payment flow did not complete the order')
    },
  )
}

let stackStarted = false
let keepStackRunning = false
try {
  await run('node', ['scripts/package-lambdas.mjs'])
  stackStarted = true
  await composeRun(['up', '--build', '-d', '--scale', 'backend=0'])
  await waitFor('LocalStack readiness', async () => {
    const response = await fetch('http://localhost:4566/_localstack/health')
    return response.ok
  })
  await waitFor('MongoDB replica-set primary', async () => {
    const result = await mongoEval(
      'print(db.adminCommand({hello: 1}).isWritablePrimary ? "ready" : "waiting")',
    )
    return result.stdout.trim() === 'ready'
  })
  await deployLocalStack()
  await composeRun(['up', '-d', 'backend'])
  await waitFor('backend process readiness', async () => {
    const result = await composeRun([
      'exec',
      '-T',
      'backend',
      'node',
      '-e',
      "fetch('http://127.0.0.1:3001/api/system/health').then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))",
    ])
    return result.stdout === ''
  })
  process.stdout.write(
    'Setup PASS LocalStack resources and local services are ready.\n',
  )
  if (prepareK6) {
    const now = Date.now()
    saleStartsAt = new Date(now - 60_000).toISOString()
    saleEndsAt = new Date(now + 3_600_000).toISOString()
    await runSeed({
      DEMO_INITIAL_SLOT_COUNT: String(k6AvailableUnits),
      DEMO_RESERVE_SLOTS: '0',
    })
    process.stdout.write(
      `K6_PREPARE PASS\nK6_LISTING_ID=${listingId}\nK6_AVAILABLE_UNITS=${k6AvailableUnits}\nK6_SALE_STARTS_AT=${saleStartsAt}\nK6_SALE_ENDS_AT=${saleEndsAt}\n`,
    )
    keepStackRunning = true
  } else {
    await runAcceptanceGates()
  }
} catch (error) {
  if (!(error instanceof Error) || !error.message.startsWith('Gate ')) {
    const message =
      error instanceof Error ? redact(error.message) : 'Unknown error'
    process.stderr.write(`Setup FAIL ${message}\n`)
  }
  process.exitCode = 1
} finally {
  if (stackStarted && !keepStackRunning) {
    await composeRun(['down']).catch((error) => {
      const message =
        error instanceof Error ? redact(error.message) : 'Unknown error'
      process.stderr.write(`Cleanup FAIL ${message}\n`)
      process.exitCode = 1
    })
  }
}
