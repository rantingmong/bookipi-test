import assert from 'node:assert/strict'
import test from 'node:test'

import {
  benchmarkProfiles,
  buildK6Diagnostics,
  buildMongoVerificationQuery,
  getProfileCounts,
  parseK6SummaryMetrics,
  redactSessionCookies,
} from './k6-benchmark-report.mjs'

test('defines exact per-VU profiles and total request counts', () => {
  assert.deepEqual(
    benchmarkProfiles.map((profile) => ({
      ...profile,
      ...getProfileCounts(profile),
    })),
    [
      {
        vus: 10,
        iterationsPerVu: 10,
        availableUnits: 20,
        sessions: 100,
        totalIterations: 100,
        accepted: 20,
        soldOut: 80,
      },
      {
        vus: 20,
        iterationsPerVu: 10,
        availableUnits: 40,
        sessions: 200,
        totalIterations: 200,
        accepted: 40,
        soldOut: 160,
      },
      {
        vus: 40,
        iterationsPerVu: 10,
        availableUnits: 80,
        sessions: 400,
        totalIterations: 400,
        accepted: 80,
        soldOut: 320,
      },
    ],
  )
})

test('reads direct metric values from the k6 summary export', () => {
  const summary = {
    metrics: {
      checkout_accepted: { count: 22 },
      checkout_sold_out: { count: 0 },
      checkout_other_conflict: { count: 0 },
      checkout_unexpected: { count: 78 },
      checkout_status_202: { count: 22 },
      checkout_status_409: { count: 0 },
      checkout_status_0: { count: 0 },
      checkout_status_other: { count: 78 },
      http_reqs: { count: 100 },
      iterations: { count: 100 },
      checks: { passes: 22, fails: 78 },
      http_req_duration: {
        avg: 60_000,
        'p(90)': 75_000,
        'p(95)': 80_000,
        'p(99)': 90_000,
        max: 95_000,
      },
      iteration_duration: { avg: 60_100 },
    },
  }

  assert.deepEqual(parseK6SummaryMetrics(summary), {
    accepted: 22,
    soldOut: 0,
    otherConflict: 0,
    unexpected: 78,
    responseStatusCounts: { 0: 0, 202: 22, 409: 0, other: 78 },
    httpRequestCount: 100,
    totalIterations: 100,
    checksPassed: 22,
    checksFailed: 78,
    requestDurationAvgMs: 60_000,
    requestDurationP90Ms: 75_000,
    requestDurationP95Ms: 80_000,
    requestDurationP99Ms: 90_000,
    requestDurationMaxMs: 95_000,
    iterationDurationAvgMs: 60_100,
  })
})

test('supports nested values in older k6 summary exports', () => {
  const summary = {
    metrics: {
      checkout_accepted: { values: { count: 30 } },
      http_reqs: { values: { count: 100 } },
      iterations: { values: { count: 100 } },
      checks: { values: { passes: 100, fails: 0 } },
      http_req_duration: { values: { avg: 12, 'p(95)': 20 } },
    },
  }

  const metrics = parseK6SummaryMetrics(summary)
  assert.equal(metrics.accepted, 30)
  assert.equal(metrics.httpRequestCount, 100)
  assert.equal(metrics.totalIterations, 100)
  assert.equal(metrics.checksPassed, 100)
  assert.equal(metrics.requestDurationAvgMs, 12)
  assert.equal(metrics.requestDurationP95Ms, 20)
})

test('builds mongosh queries with find projections', () => {
  const query = buildMongoVerificationQuery('listing-001')

  assert.match(
    query,
    /db\.orders\.find\(\{listingId:id,status:'COMPLETE'\},\{_id:0,orderId:1,customerId:1,slotId:1\}\)/,
  )
  assert.match(
    query,
    /getCollection\('listing-slots'\)\.find\(\{listingId:id,state:'secured'\},\{_id:0,orderId:1,customerId:1,slotId:1\}\)/,
  )
  assert.doesNotMatch(query, /\.project\(/)
})

test('redacts session cookie values from k6 diagnostics', () => {
  const cookie = 'better-auth.session_token=private-session-value; Path=/'
  const diagnostics = `request failed with ${cookie} private-session-value`

  const safeText = redactSessionCookies(diagnostics, [{ cookie }])

  assert.doesNotMatch(safeText, /private-session-value/)
  assert.match(safeText, /\[redacted cookie\]/)
})

test('combines and redacts stdout and stderr for k6 diagnostics', () => {
  const sessions = [
    { cookie: 'better-auth.session_token=private-session-value' },
  ]

  const diagnostics = buildK6Diagnostics(
    `stdout details ${'x'.repeat(12_100)}`,
    'stderr error private-session-value',
    sessions,
  )

  assert.match(diagnostics, /stderr error/)
  assert.doesNotMatch(diagnostics, /private-session-value/)
  assert.equal(diagnostics.length, 12_000)
})
