# Bookipi flash-sale

## Preface

AI (Codex) assisted this repository. The user provided strict oversight and judgment for design decisions, implementation direction, code review, and testing.

Conversation transcript (for transparency):

1. Preparation: https://chatgpt.com/share/6ab679b5-acf0-83ec-a288-f817948bcfb2
2. Increment 0: https://chatgpt.com/s/cx_6ab66c312e248191bd32e6ef36252e2b
3. Increment 1: https://chatgpt.com/s/cx_6ab66c5517dc81919b4c945b11b709fd
4. Increment 2: https://chatgpt.com/s/cx_6ab66c7e4b348191ac0febe8596caaa0
5. Increment 3: https://chatgpt.com/s/cx_6ab66c8f29f8819194f5ff3fdae77174
6. Increment 4: https://chatgpt.com/s/cx_6ab66c9e385c8191a64772c6aa7495ca
7. Checkpoint: https://chatgpt.com/s/cx_6ab66cae10788191a548b0a1dcd11289
8. Increment 5: https://chatgpt.com/s/cx_6ab66cd4e274819194c17f20fee779fe
9. Increment 6: https://chatgpt.com/s/cx_6ab66ce4a4408191a3b96864f7e38fa5
10. Increment 7: https://chatgpt.com/s/cx_6ab66cf7011c819190d30c37825da7fa
11. Increment 8: https://chatgpt.com/s/cx_6ab66d2e5e008191a6d4fc91edff51f6
12. Infrastructure: https://chatgpt.com/s/cx_6ab66d4d5c2481919440336c3cdd2165
13. Increment 9: https://chatgpt.com/s/cx_6ab66d3cbb708191ada88119a5e546e4
14. Cleanup: https://chatgpt.com/s/cx_6ab67666882c819188d9577e81e4df2f

## Purpose and requirements

This repository contains a high-throughput Bookipi flash-sale system and its design.

The system must support one configurable sale, one product, limited stock, and one item per customer. It must show purchase status and results in a React storefront. It must prevent overselling and support high traffic with reliable order processing.

The project requires unit, integration, and load tests. It also requires a system diagram and implementation documentation.

The runtime uses a Next.js storefront, an Express API, MongoDB, Valkey, and SQS. A checkout Lambda claims inventory and sends reservation events to SQS. The local stack uses Caddy and LocalStack. The [system design](docs/system-design.md) and its linked facets describe the current architecture and its limits.

## Local prerequisites

- Use Node.js 24 and pnpm 11.20.0.
- Install Docker and Docker Compose for local integration and load tests.
- Put a LocalStack auth token in the ignored `.localstack` file before you start the local stack. Store only the raw token in this file.
- The local stack uses `http://bookipi.localhost:3200` for the browser, port `3001` for the backend, and port `4566` for LocalStack.

## Install and run the local stack

Install dependencies from the repository root:

```sh
pnpm install
```

Prepare a stack for manual checkout load tests:

```sh
node scripts/test-integration.mjs --prepare-k6
```

This command packages the checkout Lambda, starts the services, deploys the LocalStack template, and seeds an active listing. It prints the `K6_*` values for the test. It leaves the stack running. Open `http://bookipi.localhost:3200` to use the storefront.

The command reads the token from `.localstack`. Set `LOCALSTACK_TOKEN_FILE` to use another token path. Read [local infrastructure](infra/README.md) for stack details.

Stop the stack after manual testing:

```sh
LOCALSTACK_AUTH_TOKEN=dummy BETTER_AUTH_SECRET=dummy docker compose -f infra/compose.yml down
```

The dummy values let Docker Compose read its required variables during shutdown.

## Run tests

Run unit tests:

```sh
pnpm test
```

This command generates API files, runs package unit tests, and checks the LocalStack template. It does not run the integration suite.

Run integration tests:

```sh
pnpm test:integration
```

This command builds and starts the local stack, runs the end-to-end checks, and stops its containers. It reads `.localstack` and keeps the MongoDB data volume. `pnpm build` also runs this integration suite after package builds through the root `postbuild` script.

Run the three-profile automated load benchmark:

```sh
node scripts/run-k6-benchmark.mjs
```

The benchmark uses `grafana/k6:1.5.0` in Docker. It runs 10, 20, and 40 virtual users, with 10 attempts per user and 20, 40, and 80 available units. It writes reports under `.artifacts/k6-runs/`. Run only one local stack at a time because the benchmark uses fixed ports and a fixed Docker network.

For a manual checkout load test, follow the [k6 checkout guide](load-tests/README.md). It explains session setup, test settings, result checks, and cleanup.

Run repository checks:

```sh
pnpm typecheck
pnpm format:check
git diff --check
```

## Limits and open work

Local tests do not prove deployed AWS, API Gateway, Lambda, or CloudFront behavior. The local stack uses a checkout authentication adapter because the pinned LocalStack Hobby version did not enforce the REST REQUEST authorizer in the recorded prototype. A crash or Valkey loss after an inventory claim and before SQS accepts the event has no durable replay. See [reliability](docs/reliability.md) for current safeguards and planned options.

Future improvements:

1. Break down page state hooks so each hook is closer to the component that loads it. Define mutations closer to the component that they affect.
2. Replace excessive `data-[...]` attribute selectors with standard React conditionals. The selectors were added for elements whose parent state changes, such as loading buttons and optional error messages.
3. Add a deployment script for AWS resources. The current CloudFormation example targets LocalStack. LocalStack Hobby does not support API Gateway v2 HTTP, so the AWS deployment still needs a compatible endpoint design. The authorizer currently runs inside the checkout processor for local tests, but should have its own deployment boundary.
4. Implement a more robust way to resume checkout processing. Kafka could record checkpoints, or DynamoDB Streams could provide durable events until consumers process them.
5. Run Redis and MongoDB across multiple instances.

## Design and package guides

- [System design and document map](docs/system-design.md)
- [Listing and inventory](docs/listing-and-inventory.md)
- [Checkout](docs/checkout.md)
- [Orders](docs/orders.md)
- [Payments](docs/payments.md)
- [Identity and access](docs/identity-and-access.md)
- [Reliability](docs/reliability.md)
- [Testing strategy](docs/testing-strategy.md)
- [Local infrastructure](infra/README.md)
- [k6 checkout guide](load-tests/README.md)
- [Implementation roadmap](docs/implementation-roadmap.md)
- [Package map](packages/README.md)
- [Backend](packages/backend/README.md)
- [Storefront](packages/storefront/README.md)
- [Checkout processor](packages/checkout-processor/README.md)
- [Checkout authorizer](packages/checkout-authorizer/README.md)
- [Repository instructions](AGENTS.md)
