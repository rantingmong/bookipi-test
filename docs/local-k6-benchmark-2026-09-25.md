# Local k6 checkout benchmark

## Result

The first two load profiles passed. The 40 VU profile failed because one checkout request timed out, and the combined benchmark failed.

### Checkout outcomes

| Load profile           | Attempts | Available units | HTTP 202 accepted | HTTP 409 sold out | No response | `COMPLETE` orders | Matching secured slots |
| ---------------------- | -------: | --------------: | ----------------: | ----------------: | ----------: | ----------------: | ---------------------: |
| 10 VUs × 10 iterations |      100 |              20 |                20 |                80 |           0 |                20 |                     20 |
| 20 VUs × 10 iterations |      200 |              40 |                40 |               160 |           0 |                40 |                     40 |
| 40 VUs × 10 iterations |      400 |              80 |                80 |               319 |           1 |                80 |                     80 |

### Checkout response duration

Values are in milliseconds. The average, 95th percentile, and 99th percentile include checkout requests that returned no response.

| Load profile           |   Average |        p95 |        p99 | Profile result |
| ---------------------- | --------: | ---------: | ---------: | -------------- |
| 10 VUs × 10 iterations | 1,719.995 | 16,042.708 | 17,825.892 | PASS           |
| 20 VUs × 10 iterations | 2,864.512 | 25,042.666 | 36,572.538 | PASS           |
| 40 VUs × 10 iterations | 3,979.318 | 44,860.924 | 54,384.333 | FAIL           |

At 40 VUs, one request had status `0` and lasted about 60,004 ms. The run expected 320 sold-out responses but received 319. All 80 accepted orders became `COMPLETE`, and all 80 matched a secured inventory slot. The request timeout still makes this profile fail.

Each profile created exactly as many completed orders and matching secured slots as its available inventory. This is evidence that these runs respected the configured inventory counts. It does not prove behavior under every load or failure condition.

## Method

The benchmark ran on macOS arm64 with Node.js `v24.15.0` and the `grafana/k6:1.5.0` image. It sent requests through local Caddy to a local API Gateway and Lambda setup emulated by LocalStack. LocalStack also provided SQS. MongoDB and Valkey ran locally.

The runner executed the 10, 20, and 40 VU profiles in sequence. Each VU sent 10 checkout requests. The profiles used 20, 40, and 80 available units. Each profile used a fresh Compose project, listing, database, and set of Better Auth sessions. The report records successful removal of each test project's containers and volumes.

The measured duration covers the checkout HTTP request. After k6 stopped, the runner completed accepted orders through the owner payment API and checked MongoDB order and secured-slot records. Payment completion was outside the timed checkout interval.

## Limits

These results describe one local run on one host. The benchmark did not collect CPU, memory, or database resource profiles, and it did not compare the local stack with a deployed system. Do not use it to predict AWS or production performance.

The 40 VU profile failed its expected response-count check. The two passing profiles do not cancel that failure: the combined benchmark result is `FAIL`.

The source JSON is a local, ignored file at `.artifacts/k6-runs/2026-09-25T102737666Z/report.json`. Its companion aggregate HTML report has incomplete summary fields, so this document uses the completed run records in the JSON report.

## Reproduce

From the repository root, run the command documented in the [k6 checkout guide](../load-tests/README.md):

```sh
node scripts/run-k6-benchmark.mjs
```

The runner reads the LocalStack token from `.localstack` and uses the fixed `bookipi-local` Docker network. Stop other local stacks that use the same ports before running it.
