# Local infrastructure

## Purpose

This stack supports repeatable tests across the storefront, Express, MongoDB, Valkey, API Gateway, Lambda, and SQS.

## Flow

The local browser origin is `http://bookipi.localhost:3200`. Caddy is the only browser-facing service.

| Path            | Local route                                                    |
| --------------- | -------------------------------------------------------------- |
| `/api/checkout` | LocalStack API Gateway REST API, then combined checkout Lambda |
| Other `/api/*`  | Express backend container                                      |
| Other paths     | Static storefront served by a Node process                     |

Caddy preserves browser cookies and the `Origin` header. The applications set `Cache-Control: no-store` for customer data. Caddy does not cache responses.

The API Gateway REST API uses the LocalStack custom ID `bookipi-checkout`. Compose gives LocalStack the network alias `bookipi-checkout.execute-api.localhost.localstack.cloud`. Caddy uses the documented execute-api host and `/local/api/checkout` stage path.

LocalStack runs API Gateway REST, Lambda, and SQS. It does not run CloudFront. Caddy is a local edge substitute only. This setup does not prove deployed CloudFront behavior.

The isolated [REST REQUEST authorizer prototype](localstack/prototypes/rest-request-authorizer/) shows that pinned LocalStack `2026.8.4` Hobby did not invoke or enforce the configured authorizer. The local template therefore uses `AuthorizationType: NONE`. A local-only adapter in the checkout processor Lambda checks Origin and the Better Auth session before it calls checkout behavior. This workaround is not the production architecture. It does not prove LocalStack or AWS REQUEST-authorizer behavior outside the recorded prototype.

## Services

`compose.yml` starts LocalStack, a MongoDB replica set, Valkey, the backend Node process, the storefront Node process, and Caddy. MongoDB reports healthy only after the replica set has a writable primary. This allows MongoDB transactions in the backend.

The backend consumes the order queue directly. No SQS event source mapping invokes Lambda. The queue has a 60-second visibility timeout, a dead-letter queue, and a three-receive redrive limit.

The LocalStack template creates a short-retention CloudWatch log group for the checkout Lambda. Its role can write only to its log streams and send messages to the order queue. API Gateway invokes only this Lambda. LocalStack deployment uses local test caller credentials. Production deployment IAM is outside this local stack.

The checkout processor uses Node.js 24 and deploys from `.artifacts/lambdas/checkout-processor.zip`. The package script includes production runtime dependencies. It omits optional dependencies that the Lambda handler does not use.

The test runner creates a random Better Auth secret for each run. It passes the same value to the backend and to a CloudFormation `NoEcho` parameter. It does not write the value to a tracked file. LocalStack runtime configuration can expose function environment values to local users. Production secret retrieval is outside this local-test setup.

The integration runner reads the raw LocalStack token from `.localstack`. It trims the value, passes it to Docker Compose as `LOCALSTACK_AUTH_TOKEN`, and redacts it from command errors. Do not place the token in a tracked file. `.localstack` is ignored by Git.

## Run

Place the LocalStack token in the ignored `.localstack` file. Keep the file to the raw token only. Do not add a variable name or quotes.

Run `pnpm test:integration` to package the checkout Lambda, build and start Compose, deploy the LocalStack template, seed a unique active sale, run the end-to-end checks, and stop the containers. The test keeps the MongoDB volume so local data remains available.

Run `pnpm build` to build all packages and then run the same integration suite through the root `postbuild` script. The build fails with a clear message if `.localstack` is missing or empty.

Run `pnpm package:lambdas` to build and package the checkout Lambda without starting Docker. It writes ignored output to `.artifacts/lambdas`.

## Integration checks

The suite stops at the first failed gate. It checks these gates in order:

1. Backend health through Caddy.
2. Backend worker consumption and persistence from SQS.
3. Idempotent seed state and fail-closed conflict handling.
4. Storefront contents through Caddy.
5. Listing read through the unified origin.
6. API Gateway data-plane reachability.
7. Combined Lambda invocation and invalid-session denial through API Gateway.
8. Direct invalid-session denial before checkout behavior, then valid session checkout with spoofed identity discarded.
9. Same-origin checkout, SQS persistence, owner order read, and payment outcome.

Run `pnpm test:infra` to run the focused template assertion. The root `pnpm test` command also runs this assertion.

Each run uses a unique listing ID and sale window. Its sale starts one minute before the seed and ends one hour later. This avoids fixed-date failures and seed conflicts.

The prototype and integration suite do not prove deployed AWS behavior. A deployed environment must verify CloudFront routing and cache policy, cookie and Origin forwarding, REQUEST-authorizer invocation and result caching, Lambda networking, IAM, and secret access.
