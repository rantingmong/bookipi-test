export const benchmarkProfiles = [
  { vus: 10, iterationsPerVu: 10, availableUnits: 20 },
  { vus: 20, iterationsPerVu: 10, availableUnits: 40 },
  { vus: 40, iterationsPerVu: 10, availableUnits: 80 },
]

export function getProfileCounts(profile) {
  const totalIterations = profile.vus * profile.iterationsPerVu
  return {
    sessions: totalIterations,
    totalIterations,
    accepted: profile.availableUnits,
    soldOut: totalIterations - profile.availableUnits,
  }
}

function metricValue(summary, name, key) {
  const metric = summary?.metrics?.[name]
  if (!metric) return undefined
  if (typeof metric[key] === 'number') return metric[key]
  if (typeof metric.values?.[key] === 'number') return metric.values[key]
  return undefined
}

function metricCount(summary, name) {
  const count = metricValue(summary, name, 'count')
  if (typeof count !== 'number') return 0
  return count
}

export function parseK6SummaryMetrics(summary) {
  const responseStatusCounts = {
    202: metricCount(summary, 'checkout_status_202'),
    409: metricCount(summary, 'checkout_status_409'),
    0: metricCount(summary, 'checkout_status_0'),
    other: metricCount(summary, 'checkout_status_other'),
  }
  return {
    accepted: metricCount(summary, 'checkout_accepted'),
    soldOut: metricCount(summary, 'checkout_sold_out'),
    otherConflict: metricCount(summary, 'checkout_other_conflict'),
    unexpected: metricCount(summary, 'checkout_unexpected'),
    responseStatusCounts,
    httpRequestCount: metricCount(summary, 'http_reqs'),
    totalIterations: metricCount(summary, 'iterations'),
    checksPassed: metricValue(summary, 'checks', 'passes') || 0,
    checksFailed: metricValue(summary, 'checks', 'fails') || 0,
    requestDurationAvgMs: metricValue(summary, 'http_req_duration', 'avg'),
    requestDurationP90Ms: metricValue(summary, 'http_req_duration', 'p(90)'),
    requestDurationP95Ms: metricValue(summary, 'http_req_duration', 'p(95)'),
    requestDurationP99Ms: metricValue(summary, 'http_req_duration', 'p(99)'),
    requestDurationMaxMs: metricValue(summary, 'http_req_duration', 'max'),
    iterationDurationAvgMs: metricValue(summary, 'iteration_duration', 'avg'),
  }
}

export function buildMongoVerificationQuery(listingId) {
  const encodedId = JSON.stringify(listingId)
  return `const id=${encodedId}; const orders=db.orders.find({listingId:id,status:'COMPLETE'},{_id:0,orderId:1,customerId:1,slotId:1}).toArray(); const secured=db.getCollection('listing-slots').find({listingId:id,state:'secured'},{_id:0,orderId:1,customerId:1,slotId:1}).toArray(); print(JSON.stringify({orders,secured}));`
}

export function redactSessionCookies(text, sessions) {
  let safeText = text
  for (const session of sessions) {
    if (typeof session?.cookie !== 'string') continue
    safeText = safeText.replaceAll(session.cookie, '[redacted cookie]')
    for (const pair of session.cookie.split(';')) {
      const separator = pair.indexOf('=')
      if (separator < 0) continue
      const value = pair.slice(separator + 1).trim()
      if (value)
        safeText = safeText.replaceAll(value, '[redacted cookie value]')
    }
  }
  return safeText
}

export function buildK6Diagnostics(stdout, stderr, sessions) {
  const output = [stderr, stdout].filter(Boolean).join('\n')
  return redactSessionCookies(output, sessions).slice(0, 12_000)
}
