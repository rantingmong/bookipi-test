# k6 load tests

## Three-run checkout benchmark

Run the local benchmark from the repository root:

```sh
node scripts/run-k6-benchmark.mjs
```

The runner performs three tests in order: 10 VUs with 10 iterations per VU and 20 available units; 20 VUs with 10 iterations per VU and 40 units; then 40 VUs with 10 iterations per VU and 80 units. These profiles create 100, 200, and 400 total checkout attempts. Each profile preloads one unique Better Auth session per attempt. It expects 20, 40, and 80 accepted orders, plus 80, 160, and 320 sold-out responses. It creates a new Compose project, listing, database, and session set for each test. It completes every accepted order through the owner payment API after k6 stops. This payment work is outside the measured interval.

The runner reads the LocalStack token from `.localstack`. Set `LOCALSTACK_TOKEN_FILE` to use another token path. A relative path uses the repository root. The runner uses the `grafana/k6:1.5.0` image and the `bookipi-local` Docker network. It runs tests in sequence because Compose has one fixed network name. Stop any other stack that uses the local ports before the benchmark.

Each test records response counts for HTTP 202, HTTP 409, status 0, and other statuses. It checks the built-in k6 iteration count against VUs multiplied by iterations per VU. On a k6 failure, it also saves sanitized k6 output. It checks the accepted and sold-out counts, the number of persisted owner orders, the number of MongoDB `COMPLETE` orders, and the number of `secured` slots. It also checks that each completed order has a secured slot with the same `orderId`, `customerId`, and `slotId`. The expected completed counts are 20, 40, and 80. A failed check stays a failure in the report.

The runner writes per-test `report.json` and `report.html` files and combined `report.json` and `report.html` files under `.artifacts/k6-runs/`. It saves each test result before it removes that test's Compose project and volumes. It then records cleanup status. It removes the private session file after each test. It does not remove the pre-existing `bookipi-local_mongodb-data` volume because every test uses a unique Compose project name.

## Checkout test

The checkout test uses one preloaded Better Auth session for each request. It calls only the checkout endpoint. It does not follow the payment redirect or submit a payment outcome.

Prepare the local stack and seed an active listing:

```sh
node scripts/test-integration.mjs --prepare-k6
```

This command reads the LocalStack token from `.localstack`, or from `LOCALSTACK_TOKEN_FILE`. It builds the checkout Lambda, starts Compose, deploys LocalStack, starts the backend, waits for backend health, and seeds a unique active listing. It skips the integration acceptance gates. In prepare mode, `K6_AVAILABLE_UNITS` must be `20`, `40`, or `80`; its default is `20`. The seed uses `reserveSlots: 0`. On success, the command prints `K6_LISTING_ID`, `K6_AVAILABLE_UNITS`, `K6_SALE_STARTS_AT`, and `K6_SALE_ENDS_AT`, then leaves the stack running. If preparation fails after Compose starts, it stops the stack.

Create a private session file from the running backend container:

```sh
mkdir -p .artifacts/k6
umask 077
docker exec -i bookipi-local-backend-1 node /workspace/packages/backend/dist/load-test.js 100 > .artifacts/k6/sessions.json
chmod 600 .artifacts/k6/sessions.json
```

The count creates that many new Better Auth users in MongoDB. The command prints one JSON object to standard output. Keep the file private because it contains active session cookies. Delete the file when the test ends. Valkey loss or reset invalidates these sessions.

Copy the `K6_LISTING_ID` value from the preparation output. Run the test with that active listing and the endpoint for the local stack:

```sh
K6_CHECKOUT_URL=http://bookipi.localhost:3200/api/checkout K6_LISTING_ID=PASTE_K6_LISTING_ID K6_ITERATIONS_PER_VU=10 K6_VUS=10 k6 run load-tests/checkout.js
```

Replace `PASTE_K6_LISTING_ID` with the printed listing ID. The preparation output also gives the sale window for the test report.

`K6_SESSIONS_FILE` can set another session file path. A relative path resolves from `load-tests/checkout.js`, as documented by [k6 `open()`](https://grafana.com/docs/k6/latest/javascript-api/init-context/open/). The default path is `../.artifacts/k6/sessions.json`.

`K6_ITERATIONS_PER_VU` must be a positive integer. The test uses the `per-vu-iterations` executor. It uses the zero-based `exec.scenario.iterationInTest` index to select a unique session for each total iteration. This k6 property is unique within the test, as documented by [k6 execution context](https://grafana.com/docs/k6/latest/javascript-api/k6-execution/). The session count must cover `K6_VUS` multiplied by `K6_ITERATIONS_PER_VU`. `K6_VUS` sets the number of virtual users. `K6_MAX_DURATION` sets the scenario time limit. `K6_ORIGIN` sets the request Origin header; its default is `http://bookipi.localhost:3200`.

The test records `accepted`, `sold_out`, `other_conflict`, and `unexpected` outcomes in the `checkout_outcomes` metric. Only HTTP 202 and the expected HTTP 409 `SOLD_OUT` response pass the check. Review the other metrics and the environment before you report a result. A test run does not prove deployed AWS or CloudFront behavior.

Stop the local stack after the test:

```sh
pnpm stack:stop
```
