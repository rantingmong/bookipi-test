import exec from 'k6/execution'
import { SharedArray } from 'k6/data'
import http from 'k6/http'
import { check } from 'k6'
import { Counter } from 'k6/metrics'

let sessionsFile = '../.artifacts/k6/sessions.json'
if (__ENV.K6_SESSIONS_FILE) {
  sessionsFile = __ENV.K6_SESSIONS_FILE
}

const sessions = new SharedArray('preloaded checkout sessions', () => {
  const data = JSON.parse(open(sessionsFile))
  if (!data || !Array.isArray(data.sessions) || data.sessions.length < 1) {
    throw new Error('The session file must contain a non-empty sessions array.')
  }
  for (const session of data.sessions) {
    if (
      !session ||
      typeof session.userId !== 'string' ||
      typeof session.cookie !== 'string' ||
      session.cookie.length === 0
    ) {
      throw new Error('The session file contains an invalid session.')
    }
  }
  return data.sessions
})

const checkoutUrl = __ENV.K6_CHECKOUT_URL
if (!checkoutUrl) {
  throw new Error('Set K6_CHECKOUT_URL to the checkout endpoint URL.')
}

const listingId = __ENV.K6_LISTING_ID
if (!listingId) {
  throw new Error('Set K6_LISTING_ID to the listing ID for this test.')
}

let iterations = sessions.length
if (__ENV.K6_ITERATIONS) {
  iterations = Number(__ENV.K6_ITERATIONS)
}
if (!Number.isSafeInteger(iterations) || iterations < 1) {
  throw new Error('K6_ITERATIONS must be a positive safe integer.')
}
if (iterations > sessions.length) {
  throw new Error('K6_ITERATIONS cannot exceed the preloaded session count.')
}

let vus = Math.min(10, iterations)
if (__ENV.K6_VUS) {
  vus = Number(__ENV.K6_VUS)
}
if (!Number.isSafeInteger(vus) || vus < 1) {
  throw new Error('K6_VUS must be a positive safe integer.')
}

let maxDuration = '10m'
if (__ENV.K6_MAX_DURATION) {
  maxDuration = __ENV.K6_MAX_DURATION
}

let origin = 'http://bookipi.localhost:3200'
if (__ENV.K6_ORIGIN) {
  origin = __ENV.K6_ORIGIN
}

export const options = {
  scenarios: {
    checkout: {
      executor: 'shared-iterations',
      vus,
      iterations,
      maxDuration,
    },
  },
  thresholds: {
    checks: ['rate>0.99'],
  },
}

const checkoutOutcomes = new Counter('checkout_outcomes')

export default function () {
  const iteration = exec.scenario.iterationInTest
  const session = sessions[iteration]
  const response = http.post(
    checkoutUrl,
    JSON.stringify({
      listingId,
      idempotencyKey: `k6-${iteration}`,
    }),
    {
      headers: {
        'Content-Type': 'application/json',
        Cookie: session.cookie,
        Origin: origin,
      },
      redirects: 0,
      tags: { name: 'POST /api/checkout' },
    },
  )

  let outcome = 'unexpected'
  if (response.status === 202) {
    outcome = 'accepted'
  } else if (response.status === 409) {
    let body
    try {
      body = JSON.parse(response.body)
    } catch {
      body = undefined
    }
    if (body && body.error === 'SOLD_OUT') {
      outcome = 'sold_out'
    } else {
      outcome = 'other_conflict'
    }
  }

  checkoutOutcomes.add(1, { outcome })
  check(response, {
    'checkout is accepted or sold out': () =>
      outcome === 'accepted' || outcome === 'sold_out',
  })
}
