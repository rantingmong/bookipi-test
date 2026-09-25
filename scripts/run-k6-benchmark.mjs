import { spawn } from 'node:child_process'
import { chmod, mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import {
  benchmarkProfiles,
  buildK6Diagnostics,
  buildMongoVerificationQuery,
  getProfileCounts,
  parseK6SummaryMetrics,
  redactSessionCookies,
} from './k6-benchmark-report.mjs'

const root = resolve(import.meta.dirname, '..')
const artifactRoot = resolve(root, '.artifacts/k6-runs')
const browserOrigin = process.env.LOCAL_BROWSER_ORIGIN
if (!browserOrigin)
  process.env.LOCAL_BROWSER_ORIGIN = 'http://bookipi.localhost:3200'
const runs = benchmarkProfiles.map((profile) => ({
  ...profile,
  ...getProfileCounts(profile),
}))
const runId = new Date().toISOString().replaceAll(':', '').replaceAll('.', '')
const reportDirectory = resolve(artifactRoot, runId)
const reports = []
const activeFetches = new Set()
let activeChild
let receivedSignal
let cleanupInProgress = false

function receiveSignal(signal) {
  if (!receivedSignal) receivedSignal = signal
  for (const controller of activeFetches) controller.abort()
  if (activeChild && !cleanupInProgress) activeChild.kill(signal)
}

process.on('SIGINT', () => receiveSignal('SIGINT'))
process.on('SIGTERM', () => receiveSignal('SIGTERM'))

function recordInterruption(report) {
  if (!receivedSignal) return false
  const failure = `Run interrupted by ${receivedSignal}`
  if (report.failures.includes(failure)) return false
  report.failures.push(failure)
  report.status = 'FAIL'
  return true
}

function throwIfInterrupted() {
  if (receivedSignal) throw new Error(`Run interrupted by ${receivedSignal}`)
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function runProcess(command, args, options = {}) {
  if (receivedSignal && !cleanupInProgress) {
    return Promise.reject(new Error(`Run interrupted by ${receivedSignal}`))
  }
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      cwd: root,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      ...options,
    })
    activeChild = child
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
      if (activeChild === child) activeChild = undefined
      resolvePromise({ code, stdout, stderr })
    })
  })
}

async function fetchWithSignal(url, options = {}) {
  const controller = new AbortController()
  activeFetches.add(controller)
  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } finally {
    activeFetches.delete(controller)
  }
}

function composeArgs(projectName, args) {
  return [
    'compose',
    '--project-name',
    projectName,
    '-f',
    'infra/compose.yml',
    ...args,
  ]
}

async function composeRun(projectName, args) {
  const result = await runProcess('docker', composeArgs(projectName, args), {
    env: {
      ...process.env,
      LOCALSTACK_AUTH_TOKEN:
        process.env.LOCALSTACK_AUTH_TOKEN || 'k6-compose-dummy',
      BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET || 'k6-compose-dummy',
    },
  })
  if (result.code !== 0) {
    const details = result.stderr || result.stdout || `exit code ${result.code}`
    throw new Error(`docker compose failed: ${details.trim()}`)
  }
  return result.stdout
}

function parseListingId(output) {
  const match = output.match(/^K6_LISTING_ID=([^\r\n]+)$/m)
  if (!match)
    throw new Error('Preparation output did not include K6_LISTING_ID')
  return match[1]
}

function errorMessage(error) {
  if (error instanceof Error) return error.message
  return 'Unknown error'
}

function safePathComponent(value) {
  return value.replace(/[^A-Za-z0-9_-]/g, '-')
}

function htmlReport(title, report) {
  const metricValues = report.k6?.metrics || {}
  const checks = report.checks || []
  const metricsRows = Object.entries(metricValues)
    .map(([name, value]) => {
      let displayValue = value
      if (typeof value === 'object') displayValue = JSON.stringify(value)
      return `<tr><th>${escapeHtml(name)}</th><td>${escapeHtml(displayValue)}</td></tr>`
    })
    .join('')
  const checksRows = checks
    .map((check) => {
      let resultLabel = 'FAIL'
      if (check.passed) resultLabel = 'PASS'
      return `<tr><td>${escapeHtml(check.name)}</td><td>${resultLabel}</td><td>${escapeHtml(check.detail)}</td></tr>`
    })
    .join('')
  const failures = (report.failures || [])
    .map((failure) => `<li>${escapeHtml(failure)}</li>`)
    .join('')
  let runComparison = ''
  if (Array.isArray(report.runs)) {
    const rows = report.runs
      .map((run, index) => {
        const metrics = run.k6?.metrics || {}
        const runPath = `${String(index + 1).padStart(2, '0')}-${run.environment?.sessions}-sessions/report.html`
        const statusCounts = JSON.stringify(metrics.responseStatusCounts || {})
        return `<tr><td>${escapeHtml(run.environment?.sessions)}</td><td>${escapeHtml(run.environment?.vus)}</td><td>${escapeHtml(run.environment?.iterationsPerVu)}</td><td>${escapeHtml(run.environment?.totalIterations)}</td><td>${escapeHtml(run.environment?.availableUnits)}</td><td>${escapeHtml(metrics.accepted)}</td><td>${escapeHtml(metrics.soldOut)}</td><td>${escapeHtml(statusCounts)}</td><td>${escapeHtml(run.checks?.find((check) => check.name === 'MongoDB completed order count')?.detail || 'not verified')}</td><td>${escapeHtml(run.status)}</td><td><a href="${escapeHtml(runPath)}">run report</a></td></tr>`
      })
      .join('')
    runComparison = `<h2>Run comparison</h2><table><tr><th>Sessions</th><th>Concurrent VUs</th><th>Iterations per VU</th><th>Total iterations</th><th>Available units</th><th>Accepted</th><th>Sold out</th><th>HTTP status counts</th><th>Completed orders</th><th>Result</th><th>Report</th></tr>${rows}</table>`
  }
  let statusColor = '#a12622'
  if (report.status === 'PASS') statusColor = '#14733c'
  let startedAt = report.startedAt
  if (!startedAt) startedAt = 'unknown'
  let finishedAt = report.finishedAt
  if (!finishedAt) finishedAt = 'in progress'
  let listingId = report.environment?.listingId
  if (!listingId) listingId = 'not created'
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title>
<style>body{font:15px/1.5 system-ui,sans-serif;max-width:1100px;margin:2rem auto;padding:0 1rem;color:#172033}table{border-collapse:collapse;width:100%;margin:1rem 0 2rem}th,td{border:1px solid #ccd3df;padding:.45rem;text-align:left}th{background:#edf1f7}code{overflow-wrap:anywhere}.status{font-weight:700;color:${statusColor}}</style>
</head><body><h1>${escapeHtml(title)}</h1><p class="status">${escapeHtml(report.status || 'INCOMPLETE')}</p>
<p>Started: ${escapeHtml(startedAt)}<br>Finished: ${escapeHtml(finishedAt)}<br>Listing: <code>${escapeHtml(listingId)}</code></p>
${runComparison}<h2>Environment</h2><table>${Object.entries(
    report.environment || {},
  )
    .map(
      ([name, value]) =>
        `<tr><th>${escapeHtml(name)}</th><td>${escapeHtml(value)}</td></tr>`,
    )
    .join('')}</table>
<h2>Load metrics and outcomes</h2><table>${metricsRows}</table>
<h2>Verification checks</h2><table><tr><th>Check</th><th>Result</th><th>Detail</th></tr>${checksRows}</table>
<h2>Failures</h2><ul>${failures || '<li>None</li>'}</ul></body></html>`
}

async function saveReport(directory, report, title) {
  const jsonPath = resolve(directory, 'report.json')
  const htmlPath = resolve(directory, 'report.html')
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`)
  await writeFile(htmlPath, htmlReport(title, report))
  return { jsonPath, htmlPath }
}

async function loadSummary(summaryPath, report) {
  try {
    const summary = JSON.parse(await readFile(summaryPath, 'utf8'))
    report.k6 = {
      metrics: parseK6SummaryMetrics(summary),
    }
    report.k6.raw = summary
    return summary
  } catch (error) {
    report.failures.push(`k6 summary was not available: ${errorMessage(error)}`)
    return undefined
  }
}

async function requestJson(url, options = {}) {
  const response = await fetchWithSignal(url, options)
  const body = await response.text()
  let data
  try {
    data = JSON.parse(body)
  } catch {
    throw new Error(`${url} returned non-JSON HTTP ${response.status}`)
  }
  return { response, data }
}

async function readCurrentOrders(sessions, listingId, origin, report) {
  const endpoint = new URL('/api/orders/current', origin)
  endpoint.searchParams.set('listingId', listingId)
  const owners = new Array(sessions.length)
  const acceptedExpected = report.k6?.metrics.accepted
  if (typeof acceptedExpected !== 'number') return owners
  const deadline = Date.now() + 120_000
  let found = 0
  const failedOwners = new Array(sessions.length).fill(false)
  while (Date.now() < deadline && found < acceptedExpected) {
    throwIfInterrupted()
    for (let offset = 0; offset < sessions.length; offset += 50) {
      const batch = sessions.slice(offset, offset + 50)
      const responses = await Promise.all(
        batch.map(async (session, index) => {
          if (owners[offset + index] || failedOwners[offset + index])
            return owners[offset + index]
          try {
            const response = await fetchWithSignal(endpoint, {
              headers: { Cookie: session.cookie, Origin: origin },
            })
            if (response.status === 404) return undefined
            if (!response.ok)
              throw new Error(
                `owner order read returned HTTP ${response.status}`,
              )
            const data = await response.json()
            if (
              data.listingId !== listingId ||
              data.customerId !== session.userId ||
              typeof data.orderId !== 'string' ||
              typeof data.slotId !== 'string'
            ) {
              throw new Error(
                'owner order read returned mismatched order facts',
              )
            }
            return data
          } catch (error) {
            report.failures.push(errorMessage(error))
            failedOwners[offset + index] = true
            return undefined
          }
        }),
      )
      throwIfInterrupted()
      for (let index = 0; index < responses.length; index += 1) {
        const ownerIndex = offset + index
        if (!owners[ownerIndex] && responses[index]) {
          owners[ownerIndex] = responses[index]
          found += 1
        }
      }
    }
    if (found < acceptedExpected) await delay(1000)
  }
  return owners
}

async function completeOrders(sessions, owners, origin, report) {
  throwIfInterrupted()
  const ownerOrders = owners.filter(Boolean)
  const expectedAccepted = report.k6?.metrics.accepted
  report.checks.push({
    name: 'Accepted requests have persisted owner orders',
    passed: ownerOrders.length === expectedAccepted,
    detail: `${ownerOrders.length} persisted of ${expectedAccepted ?? 'unknown'} accepted requests`,
  })
  if (ownerOrders.length !== expectedAccepted) {
    report.failures.push(
      'Accepted request count does not match persisted owner order count',
    )
  }

  for (let offset = 0; offset < ownerOrders.length; offset += 50) {
    throwIfInterrupted()
    const batch = ownerOrders.slice(offset, offset + 50)
    await Promise.all(
      batch.map(async (order) => {
        const index = owners.indexOf(order)
        const session = sessions[index]
        if (!session) {
          report.failures.push(`No session matched order ${order.orderId}`)
          return
        }
        if (order.status === 'COMPLETE') return
        if (order.status !== 'PENDING') {
          report.failures.push(
            `Order ${order.orderId} has unexpected status ${order.status}`,
          )
          return
        }
        try {
          const { response, data } = await requestJson(
            new URL(
              `/api/orders/${encodeURIComponent(order.orderId)}/payment-outcome`,
              origin,
            ),
            {
              method: 'POST',
              headers: {
                Cookie: session.cookie,
                Origin: origin,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ outcome: 'success' }),
            },
          )
          if (!response.ok || data.status !== 'COMPLETE') {
            throw new Error(
              `payment outcome returned HTTP ${response.status} and status ${data.status}`,
            )
          }
          order.status = data.status
        } catch (error) {
          report.failures.push(`Order ${order.orderId}: ${errorMessage(error)}`)
        }
      }),
    )
    throwIfInterrupted()
  }
}

async function verifyMongo(projectName, listingId, expectedUnits, report) {
  const query = buildMongoVerificationQuery(listingId)
  const output = await composeRun(projectName, [
    'exec',
    '-T',
    'mongodb',
    'mongosh',
    'mongodb://mongodb:27017/bookipi?replicaSet=rs0',
    '--quiet',
    '--eval',
    query,
  ])
  const data = JSON.parse(output.trim())
  const securedByOrder = new Map(
    data.secured.map((slot) => [slot.orderId, slot]),
  )
  const mismatches = []
  for (const order of data.orders) {
    const slot = securedByOrder.get(order.orderId)
    if (
      !slot ||
      slot.customerId !== order.customerId ||
      slot.slotId !== order.slotId
    ) {
      mismatches.push(order.orderId)
    }
  }
  const checks = [
    {
      name: 'MongoDB completed order count',
      passed: data.orders.length === expectedUnits,
      detail: `${data.orders.length} COMPLETE orders; expected ${expectedUnits}`,
    },
    {
      name: 'MongoDB secured slot count',
      passed: data.secured.length === expectedUnits,
      detail: `${data.secured.length} secured slots; expected ${expectedUnits}`,
    },
    {
      name: 'Each secured slot matches its completed order',
      passed: mismatches.length === 0 && data.orders.length === expectedUnits,
      detail: `All ${data.orders.length} order and slot bindings match`,
    },
  ]
  if (mismatches.length > 0) {
    checks[2].detail = `Mismatched order IDs: ${mismatches.join(', ')}`
  }
  report.checks.push(...checks)
  for (const check of checks) {
    if (!check.passed) report.failures.push(check.detail)
  }
}

async function runOne(config, index) {
  const startedAt = new Date().toISOString()
  const name = `${config.sessions}-sessions-${config.vus}-vus-${safePathComponent(runId)}`
  const directory = resolve(
    reportDirectory,
    `${String(index + 1).padStart(2, '0')}-${config.sessions}-sessions`,
  )
  const projectName =
    `bookipi-k6-${safePathComponent(runId)}-${index + 1}-${config.sessions}`.toLowerCase()
  const sessionPath = resolve(directory, 'sessions.json')
  const summaryPath = resolve(directory, 'k6-summary.json')
  await mkdir(directory, { recursive: true, mode: 0o700 })
  const report = {
    status: 'INCOMPLETE',
    startedAt,
    finishedAt: null,
    environment: {
      sessions: config.sessions,
      vus: config.vus,
      iterationsPerVu: config.iterationsPerVu,
      totalIterations: config.totalIterations,
      availableUnits: config.availableUnits,
      reserveSlots: 0,
      composeProject: projectName,
      composeNetwork: 'bookipi-local',
      k6Image: 'grafana/k6:1.5.0',
      endpoint: 'http://caddy:3200/api/checkout',
      browserOrigin: process.env.LOCAL_BROWSER_ORIGIN,
      listingId: null,
      saleStartsAt: null,
      saleEndsAt: null,
    },
    k6: null,
    checks: [],
    failures: [],
    cleanup: {
      attempted: false,
      passed: null,
      preserved: false,
      detail: null,
    },
  }
  let sessions
  let prepared = false

  try {
    if (receivedSignal) throw new Error(`Run interrupted by ${receivedSignal}`)
    const preparation = await runProcess(
      'node',
      ['scripts/test-integration.mjs', '--prepare-k6'],
      {
        env: {
          ...process.env,
          COMPOSE_PROJECT_NAME: projectName,
          K6_AVAILABLE_UNITS: String(config.availableUnits),
        },
      },
    )
    if (preparation.code !== 0) {
      throw new Error(
        `Local stack preparation failed: ${(preparation.stderr || preparation.stdout).trim()}`,
      )
    }
    prepared = true
    const listingId = parseListingId(preparation.stdout)
    report.environment.listingId = listingId
    const starts = preparation.stdout.match(/^K6_SALE_STARTS_AT=([^\r\n]+)$/m)
    const ends = preparation.stdout.match(/^K6_SALE_ENDS_AT=([^\r\n]+)$/m)
    if (starts) report.environment.saleStartsAt = starts[1]
    if (ends) report.environment.saleEndsAt = ends[1]

    const sessionOutput = await composeRun(projectName, [
      'exec',
      '-T',
      'backend',
      'node',
      '/workspace/packages/backend/dist/load-test.js',
      String(config.sessions),
    ])
    await writeFile(sessionPath, sessionOutput, { mode: 0o600, flag: 'wx' })
    await chmod(sessionPath, 0o600)
    const sessionData = JSON.parse(sessionOutput)
    sessions = sessionData.sessions
    if (!Array.isArray(sessions) || sessions.length !== config.sessions) {
      throw new Error(
        `Session preload returned ${sessions?.length || 0} sessions; expected ${config.sessions}`,
      )
    }

    const k6Result = await runProcess('docker', [
      'run',
      '--rm',
      '--network',
      'bookipi-local',
      '--user',
      `${process.getuid?.() || 0}:${process.getgid?.() || 0}`,
      '--mount',
      `type=bind,source=${resolve(root, 'load-tests')},target=/scripts,readonly`,
      '--mount',
      `type=bind,source=${sessionPath},target=/artifacts/sessions.json,readonly`,
      '--mount',
      `type=bind,source=${directory},target=/results`,
      '-e',
      'K6_CHECKOUT_URL=http://caddy:3200/api/checkout',
      '-e',
      `K6_LISTING_ID=${listingId}`,
      '-e',
      `K6_ITERATIONS_PER_VU=${config.iterationsPerVu}`,
      '-e',
      `K6_VUS=${config.vus}`,
      '-e',
      'K6_MAX_DURATION=10m',
      '-e',
      `K6_ORIGIN=${process.env.LOCAL_BROWSER_ORIGIN}`,
      '-e',
      'K6_SESSIONS_FILE=/artifacts/sessions.json',
      'grafana/k6:1.5.0',
      'run',
      '--summary-trend-stats=avg,min,med,max,p(90),p(95),p(99)',
      `--summary-export=/results/k6-summary.json`,
      '/scripts/checkout.js',
    ])
    const summary = await loadSummary(summaryPath, report)
    const diagnostics = buildK6Diagnostics(
      k6Result.stdout,
      k6Result.stderr,
      sessions,
    )
    if (k6Result.code !== 0) {
      report.failures.push(`k6 exited with code ${k6Result.code}`)
      if (!report.k6) report.k6 = {}
      report.k6.diagnostics = diagnostics
    }
    if (!summary) {
      if (!report.k6) report.k6 = {}
      report.k6.diagnostics = diagnostics
      throw new Error('k6 did not produce a readable summary')
    }

    const expectedOutcomes = {
      accepted: config.accepted,
      soldOut: config.soldOut,
      otherConflict: 0,
      unexpected: 0,
    }
    const actualOutcomes = report.k6.metrics
    const outcomeMatches = Object.entries(expectedOutcomes).every(
      ([key, value]) => actualOutcomes[key] === value,
    )
    report.checks.push({
      name: 'Checkout outcome counts',
      passed: outcomeMatches,
      detail: `accepted ${actualOutcomes.accepted}, sold out ${actualOutcomes.soldOut}, conflicts ${actualOutcomes.otherConflict}, unexpected ${actualOutcomes.unexpected}; expected accepted ${expectedOutcomes.accepted}, sold out ${expectedOutcomes.soldOut}, no conflicts or unexpected responses`,
    })
    if (!outcomeMatches)
      report.failures.push(
        'Checkout outcomes did not match the expected available unit count',
      )
    const actualIterations = actualOutcomes.totalIterations
    const iterationCountMatches = actualIterations === config.totalIterations
    report.checks.push({
      name: 'Total k6 iteration count',
      passed: iterationCountMatches,
      detail: `${actualIterations} total iterations; expected ${config.vus} VUs x ${config.iterationsPerVu} iterations per VU = ${config.totalIterations}`,
    })
    if (!iterationCountMatches) {
      report.failures.push('Total k6 iteration count did not match the profile')
    }
    if (!outcomeMatches && !report.k6.diagnostics) {
      report.k6.diagnostics = diagnostics
    }

    const owners = await readCurrentOrders(
      sessions,
      listingId,
      process.env.LOCAL_BROWSER_ORIGIN,
      report,
    )
    throwIfInterrupted()
    await completeOrders(
      sessions,
      owners,
      process.env.LOCAL_BROWSER_ORIGIN,
      report,
    )
    await verifyMongo(projectName, listingId, config.availableUnits, report)
  } catch (error) {
    report.failures.push(errorMessage(error))
  } finally {
    try {
      await unlink(sessionPath)
    } catch (error) {
      if (error.code !== 'ENOENT') {
        let code = error.code
        if (!code) code = 'unknown error'
        report.failures.push(
          `Could not delete the private session file (${code}).`,
        )
      }
    }
    recordInterruption(report)
    report.finishedAt = new Date().toISOString()
    report.status = 'PASS'
    if (
      report.failures.length > 0 ||
      !report.checks.every((check) => check.passed)
    ) {
      report.status = 'FAIL'
    }
    let reportSaveFailed = false
    try {
      await saveReport(directory, report, `${name} k6 checkout run`)
    } catch (error) {
      reportSaveFailed = true
      report.failures.push(
        `Could not save the report before cleanup: ${errorMessage(error)}`,
      )
      report.status = 'FAIL'
    }
    if (recordInterruption(report)) {
      await saveReport(directory, report, `${name} k6 checkout run`).catch(
        (error) => {
          process.stderr.write(
            `Could not update report before cleanup: ${errorMessage(error)}\n`,
          )
        },
      )
    }

    report.cleanup.attempted = true
    if (reportSaveFailed && prepared) {
      report.cleanup.preserved = true
      report.cleanup.passed = false
      report.cleanup.detail =
        'Project containers and volumes remain active because the pre-cleanup report could not be saved.'
      process.stderr.write(
        `Preserved Compose project ${projectName}. MongoDB evidence remains in its project volume. Review the report path ${resolve(directory, 'report.json')}, then remove the project with: docker compose --project-name ${projectName} -f infra/compose.yml down\n`,
      )
    } else {
      cleanupInProgress = true
      try {
        await composeRun(projectName, ['down', '-v'])
        report.cleanup.passed = true
        report.cleanup.detail = 'Project containers and volumes were removed.'
      } catch (error) {
        report.cleanup.passed = false
        report.cleanup.detail = errorMessage(error)
        report.failures.push(`Compose cleanup failed: ${errorMessage(error)}`)
        report.status = 'FAIL'
      } finally {
        cleanupInProgress = false
      }
    }
    recordInterruption(report)
    await saveReport(directory, report, `${name} k6 checkout run`).catch(
      (error) => {
        process.stderr.write(
          `Could not update report after cleanup: ${errorMessage(error)}\n`,
        )
      },
    )
    if (recordInterruption(report)) {
      await saveReport(directory, report, `${name} k6 checkout run`).catch(
        (error) => {
          process.stderr.write(
            `Could not update report after cleanup: ${errorMessage(error)}\n`,
          )
        },
      )
    }
    if (!prepared && report.environment.listingId === null) {
      report.checks.push({
        name: 'Local stack preparation',
        passed: false,
        detail: 'Preparation did not complete. The project cleanup still ran.',
      })
      report.status = 'FAIL'
      await saveReport(directory, report, `${name} k6 checkout run`).catch(
        (error) => {
          process.stderr.write(
            `Could not update report after cleanup: ${errorMessage(error)}\n`,
          )
        },
      )
    }
    reports.push({ ...report, reportDirectory: directory })
  }
  return report
}

await mkdir(reportDirectory, { recursive: true, mode: 0o700 })
for (let index = 0; index < runs.length; index += 1) {
  if (receivedSignal) break
  const report = await runOne(runs[index], index)
  process.stdout.write(
    `${report.status} ${report.environment.sessions} sessions at ${report.environment.vus} VUs; reports: ${reportDirectory}\n`,
  )
  if (receivedSignal || report.cleanup.preserved) break
}

const combined = {
  createdAt: new Date().toISOString(),
  environment: {
    host: process.platform,
    architecture: process.arch,
    node: process.version,
    k6Image: 'grafana/k6:1.5.0',
    network: 'bookipi-local',
  },
  status: 'PASS',
  failures: [],
  runs: reports,
}
if (reports.some((report) => report.status !== 'PASS')) combined.status = 'FAIL'
if (reports.length !== runs.length) {
  combined.status = 'FAIL'
  combined.failures.push(
    `Only ${reports.length} of ${runs.length} load runs completed.`,
  )
}
if (receivedSignal) {
  combined.status = 'FAIL'
  combined.failures.push(`Benchmark interrupted by ${receivedSignal}.`)
}
await saveReport(reportDirectory, combined, 'Three-run k6 checkout benchmark')
process.stdout.write(
  `Combined ${combined.status}; HTML: ${resolve(reportDirectory, 'report.html')}\n`,
)
if (combined.status !== 'PASS') process.exitCode = 1
if (receivedSignal === 'SIGINT') process.exitCode = 130
if (receivedSignal === 'SIGTERM') process.exitCode = 143
