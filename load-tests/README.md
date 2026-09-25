# k6 load tests

## Checkout test

The checkout test uses one preloaded Better Auth session for each request. It calls only the checkout endpoint. It does not follow the payment redirect or submit a payment outcome.

Prepare the local stack and seed an active listing:

```sh
node scripts/test-integration.mjs --prepare-k6
```

This command reads the LocalStack token from `.localstack`. It builds the checkout Lambda, starts Compose, deploys LocalStack, starts the backend, waits for backend health, and seeds a unique active listing. It skips the integration acceptance gates. On success, it prints `K6_LISTING_ID`, `K6_SALE_STARTS_AT`, and `K6_SALE_ENDS_AT`, then leaves the stack running. If preparation fails after Compose starts, it stops the stack.

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
K6_CHECKOUT_URL=http://bookipi.localhost:3200/api/checkout K6_LISTING_ID=PASTE_K6_LISTING_ID K6_ITERATIONS=100 K6_VUS=25 k6 run load-tests/checkout.js
```

Replace `PASTE_K6_LISTING_ID` with the printed listing ID. The preparation output also gives the sale window for the test report.

`K6_SESSIONS_FILE` can set another session file path. A relative path resolves from `load-tests/checkout.js`, as documented by [k6 `open()`](https://grafana.com/docs/k6/latest/javascript-api/init-context/open/). The default path is `../.artifacts/k6/sessions.json`.

`K6_ITERATIONS` must be a positive integer no larger than the session count. The test uses the zero-based `exec.scenario.iterationInTest` index to select one session for each iteration. This k6 property is unique within the test, as documented by [k6 execution context](https://grafana.com/docs/k6/latest/javascript-api/k6-execution/). `K6_VUS` sets the number of virtual users. `K6_MAX_DURATION` sets the shared-iterations time limit. `K6_ORIGIN` sets the request Origin header; its default is `http://bookipi.localhost:3200`.

The test records `accepted`, `sold_out`, `other_conflict`, and `unexpected` outcomes in the `checkout_outcomes` metric. Only HTTP 202 and the expected HTTP 409 `SOLD_OUT` response pass the check. Review the other metrics and the environment before you report a result. A test run does not prove deployed AWS or CloudFront behavior.

Stop the local stack after the test. Compose needs values for its required variables while it reads the file. Dummy values are enough for `down`:

```sh
LOCALSTACK_AUTH_TOKEN=dummy BETTER_AUTH_SECRET=dummy docker compose -f infra/compose.yml down
```
