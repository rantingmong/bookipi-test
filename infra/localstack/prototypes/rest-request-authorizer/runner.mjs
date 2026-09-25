import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const prototypeDirectory = path.dirname(fileURLToPath(import.meta.url))
const repositoryDirectory = path.resolve(prototypeDirectory, '../../../..')
const composeFile = path.join(prototypeDirectory, 'compose.yml')
const tokenFile = path.join(repositoryDirectory, '.localstack')
const projectName = 'rest-request-authorizer-prototype'
const apiEndpoint =
  'http://rest-request-authz-proof.execute-api.localhost.localstack.cloud:14566/local/probe'
const authorizerFunctionName = 'rest-request-authz-proof-authorizer'
const backendFunctionName = 'rest-request-authz-proof-backend'
const authorizerLogGroup = `/aws/lambda/${authorizerFunctionName}`
const backendLogGroup = `/aws/lambda/${backendFunctionName}`
const localStackPort = 14566
const expectedLocalStackVersionPrefix = '2026.8.4:'

let localStackToken = ''

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: repositoryDirectory,
      env: {
        ...process.env,
        AWS_DEFAULT_REGION: 'ap-southeast-1',
        LOCALSTACK_AUTH_TOKEN: localStackToken,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    let timeoutMs = options.timeoutMs
    if (timeoutMs === undefined) timeoutMs = 60_000
    const timer = setTimeout(() => {
      child.kill('SIGTERM')
    }, timeoutMs)

    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk) => {
      stdout += chunk
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk
    })
    child.on('error', (error) => {
      clearTimeout(timer)
      reject(new Error(`${command} could not start: ${error.message}`))
    })
    child.on('close', (code, signal) => {
      clearTimeout(timer)
      if (code === 0) {
        resolve({ stdout, stderr })
        return
      }
      let status = code
      if (status === null) status = signal
      if (status === null) status = 'unknown status'
      const detail = `${stdout}\n${stderr}`
        .split('\n')
        .map((line) => redact(line))
        .filter((line) => line.length > 0)
        .slice(-8)
        .join('\n')
      reject(
        new Error(
          `${command} failed with ${status}${detail ? `:\n${detail}` : ''}`,
        ),
      )
    })
  })
}

function compose(...args) {
  return run('docker', [
    'compose',
    '-p',
    projectName,
    '-f',
    composeFile,
    ...args,
  ])
}

function redact(value) {
  if (localStackToken.length === 0) return value
  return value.replaceAll(localStackToken, '[redacted]')
}

function parseJson(value, description) {
  try {
    return JSON.parse(value)
  } catch {
    throw new Error(`${description} returned invalid JSON`)
  }
}

async function waitForLocalStack() {
  const deadline = Date.now() + 120_000
  while (Date.now() < deadline) {
    try {
      const response = await fetch(
        `http://localhost:${localStackPort}/_localstack/health`,
      )
      if (response.ok) return
    } catch {
      await delay(1_000)
    }
  }
  throw new Error('LocalStack did not become healthy within 120 seconds')
}

async function localStackInfo() {
  const response = await fetch(
    `http://localhost:${localStackPort}/_localstack/info`,
  )
  if (!response.ok)
    throw new Error('LocalStack info endpoint did not return success')
  const info = await response.json()
  const version = info.version
  const edition = info.edition
  const licenseActivated = info.is_license_activated
  if (typeof version !== 'string' || typeof edition !== 'string') {
    throw new Error(
      'LocalStack info endpoint did not include version and edition',
    )
  }
  console.log(
    `LOCALSTACK version=${version} edition=${edition} licenseActivated=${Boolean(licenseActivated)}`,
  )
  if (!version.startsWith(expectedLocalStackVersionPrefix)) {
    throw new Error(
      `Expected LocalStack ${expectedLocalStackVersionPrefix.slice(0, -1)}. Received ${version}`,
    )
  }
}

async function deployTemplate() {
  await compose(
    'exec',
    '-T',
    'localstack',
    'awslocal',
    'cloudformation',
    'deploy',
    '--template-file',
    '/prototype/template.yaml',
    '--stack-name',
    'rest-request-authz-proof',
    '--capabilities',
    'CAPABILITY_IAM',
  )
}

async function localAwsJson(...args) {
  const result = await compose('exec', '-T', 'localstack', 'awslocal', ...args)
  return parseJson(result.stdout, args.join(' '))
}

async function stackOutput(outputKey) {
  const response = await localAwsJson(
    'cloudformation',
    'describe-stacks',
    '--stack-name',
    'rest-request-authz-proof',
  )
  const outputs = response.Stacks?.[0]?.Outputs ?? []
  const output = outputs.find((item) => item.OutputKey === outputKey)
  if (!output?.OutputValue)
    throw new Error(`CloudFormation output ${outputKey} is missing`)
  return output.OutputValue
}

async function verifyMethod(apiId) {
  const resources = await localAwsJson(
    'apigateway',
    'get-resources',
    '--rest-api-id',
    apiId,
  )
  const resource = resources.items?.find((item) => item.path === '/probe')
  if (!resource) throw new Error('REST API resource /probe is missing')

  const method = await localAwsJson(
    'apigateway',
    'get-method',
    '--rest-api-id',
    apiId,
    '--resource-id',
    resource.id,
    '--http-method',
    'GET',
  )
  const authorizers = await localAwsJson(
    'apigateway',
    'get-authorizers',
    '--rest-api-id',
    apiId,
  )
  const authorizer = authorizers.items?.find(
    (item) => item.id === method.authorizerId,
  )
  if (!authorizer)
    throw new Error('Configured REST REQUEST authorizer is missing')
  const expectedIdentitySource = 'method.request.header.x-prototype-token'
  const authorizerUri = authorizer.authorizerUri
  const uriTargetsAuthorizer =
    typeof authorizerUri === 'string' &&
    authorizerUri.includes(`function:${authorizerFunctionName}/invocations`)
  const details = {
    authorizationType: method.authorizationType,
    authorizerType: authorizer.type,
    identitySource: authorizer.identitySource,
    ttl: authorizer.authorizerResultTtlInSeconds,
    authorizerUri,
    uriTargetsAuthorizer,
  }
  console.log(
    `METHOD authorization=${details.authorizationType} type=${details.authorizerType} identitySource=${details.identitySource} ttl=${details.ttl} uri=${details.authorizerUri}`,
  )
  if (
    details.authorizationType !== 'CUSTOM' ||
    details.authorizerType !== 'REQUEST' ||
    details.identitySource !== expectedIdentitySource ||
    details.ttl !== 0 ||
    !details.uriTargetsAuthorizer
  ) {
    throw new Error(
      'Deployed REST method does not match the expected REQUEST authorizer settings',
    )
  }
}

async function markerCount(logGroup, marker) {
  const result = await compose(
    'exec',
    '-T',
    'localstack',
    'awslocal',
    'logs',
    'filter-log-events',
    '--log-group-name',
    logGroup,
    '--filter-pattern',
    `"${marker}"`,
  )
  const response = parseJson(result.stdout, 'CloudWatch log marker query')
  return response.events?.length ?? 0
}

async function observeMarkerCount(logGroup, marker, previousCount, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const currentCount = await markerCount(logGroup, marker)
    if (currentCount > previousCount) return currentCount
    await delay(500)
  }
  return markerCount(logGroup, marker)
}

async function directAuthorizerInvocation(eventFile, expectedEffect) {
  const beforeCount = await markerCount(
    authorizerLogGroup,
    'REST_REQUEST_AUTHORIZER_INVOKED',
  )
  await compose(
    'exec',
    '-T',
    'localstack',
    'awslocal',
    'lambda',
    'invoke',
    '--function-name',
    authorizerFunctionName,
    '--payload',
    `fileb:///prototype/${eventFile}`,
    '/tmp/rest-request-authorizer-direct.json',
  )
  const output = await compose(
    'exec',
    '-T',
    'localstack',
    'node',
    '-e',
    "const fs = require('node:fs'); const result = JSON.parse(fs.readFileSync('/tmp/rest-request-authorizer-direct.json', 'utf8')); process.stdout.write(result.policyDocument.Statement[0].Effect)",
  )
  const effect = output.stdout.trim()
  const afterCount = await observeMarkerCount(
    authorizerLogGroup,
    'REST_REQUEST_AUTHORIZER_INVOKED',
    beforeCount,
    15_000,
  )
  let directName = 'DIRECT-DENY'
  if (expectedEffect === 'Allow') directName = 'DIRECT-ALLOW'
  console.log(
    `${directName} effect=${effect} markerCount=${beforeCount}->${afterCount}`,
  )
  if (effect !== expectedEffect || afterCount <= beforeCount) {
    throw new Error(
      `Direct authorizer invocation did not return ${expectedEffect} with a safe log marker`,
    )
  }
}

async function callApi(resultName, token) {
  const authorizerBefore = await markerCount(
    authorizerLogGroup,
    'REST_REQUEST_AUTHORIZER_INVOKED',
  )
  const backendBefore = await markerCount(
    backendLogGroup,
    'REST_REQUEST_BACKEND_INVOKED',
  )
  let response
  let bodyText = ''
  try {
    response = await fetch(apiEndpoint, {
      headers: { 'x-prototype-token': token },
      redirect: 'manual',
    })
    bodyText = await response.text()
  } catch (error) {
    throw new Error(`API request failed: ${error.message}`)
  }

  const authorizerAfter = await observeMarkerCount(
    authorizerLogGroup,
    'REST_REQUEST_AUTHORIZER_INVOKED',
    authorizerBefore,
    3_000,
  )
  const backendAfter = await observeMarkerCount(
    backendLogGroup,
    'REST_REQUEST_BACKEND_INVOKED',
    backendBefore,
    3_000,
  )
  let parsedBody
  try {
    parsedBody = JSON.parse(bodyText)
  } catch {
    parsedBody = undefined
  }
  const backendObserved = backendAfter > backendBefore
  let bodyName = 'non-json'
  if (parsedBody?.backend === 'invoked') bodyName = 'backend-invoked'
  let backendName = 'not-invoked'
  if (backendObserved) backendName = 'invoked'
  let contextName = 'absent'
  if (parsedBody?.authorizerContext?.proof === 'rest-request-authorizer') {
    contextName = 'rest-request-authorizer'
  }
  console.log(
    `${resultName} status=${response.status} authorizerMarker=${authorizerBefore}->${authorizerAfter} backend=${backendName} body=${bodyName} context=${contextName}`,
  )
  return {
    status: response.status,
    authorizerInvoked: authorizerAfter > authorizerBefore,
    backendInvoked: backendObserved,
    contextPresent: contextName !== 'absent',
  }
}

async function main() {
  if (Number(process.versions.node.split('.')[0]) < 24) {
    throw new Error(
      `Node.js 24 or later is required. Current version is ${process.versions.node}`,
    )
  }
  try {
    localStackToken = (await readFile(tokenFile, 'utf8')).trim()
  } catch {
    throw new Error(
      'The raw LocalStack token is missing. Create the ignored repository-root .localstack file.',
    )
  }
  if (localStackToken.length === 0) {
    throw new Error('The repository-root .localstack file is empty')
  }

  let runError
  try {
    await compose('up', '-d', 'localstack')
    await waitForLocalStack()
    await localStackInfo()
    await deployTemplate()
    const apiId = await stackOutput('ApiId')
    await verifyMethod(apiId)
    await directAuthorizerInvocation('direct-event.json', 'Allow')
    await directAuthorizerInvocation('direct-deny-event.json', 'Deny')
    const allowResult = await callApi('ALLOW', 'allow-probe')
    const denyResult = await callApi('DENY', 'deny-probe')
    const enforced =
      allowResult.status === 200 &&
      allowResult.authorizerInvoked &&
      allowResult.contextPresent &&
      allowResult.backendInvoked &&
      denyResult.status === 403 &&
      denyResult.authorizerInvoked &&
      !denyResult.backendInvoked
    let enforcement = 'not-enforced-or-incompatible'
    if (enforced) enforcement = 'enforced'
    console.log(`PROOF authorizerEnforcement=${enforcement}`)
  } catch (error) {
    runError = error
  } finally {
    try {
      await compose('down', '--remove-orphans')
      console.log('CLEANUP complete')
    } catch (error) {
      if (runError === undefined) runError = error
      else console.error(`CLEANUP failure ${redact(error.message)}`)
    }
  }
  if (runError !== undefined) throw runError
}

main().catch((error) => {
  console.error(`FAIL ${redact(error.message)}`)
  localStackToken = ''
  process.exitCode = 1
})
