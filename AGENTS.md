# Repository instructions

## Repository map

This repository contains a pnpm monorepo for a high-throughput Bookipi flash sale.

- `packages/backend` contains the Express API bootstrap, OpenAPI contracts, and planned business services.
- `packages/storefront` contains the static-export Next.js user interface.
- `packages/checkout-processor` contains the planned AWS Lambda checkout processor.
- `packages/checkout-authorizer` contains the planned API Gateway authorizer.
- `docs` contains the system-design entry point, design facets, test strategy, and implementation roadmap.

Read the root `README.md` and every applicable directory `README.md` before work.

## Toolchain

- Use pnpm for package management.
- Use Node.js 24 and TypeScript.
- Use ECMAScript modules with `"type": "module"`.
- Use the backend `#app` and `#api/*` package imports, and the storefront `@/*` TypeScript alias.
- Do not add npm or Yarn lockfiles.
- Do not guess commands. Confirm a command in a manifest or document before use.

## Branch and worktree rules

- The default branch is `main`.
- Do not edit `main` directly.
- Use a sibling worktree for implementation: `git worktree add ../<repo>-<slug> -b <branch>`.
- Use branch names in the form `<area>/<short-slug>`, such as `docs/system-design` or `feat/checkout-reservation`.
- Keep each increment small and reviewable.

## Commit vocabulary

Use `type(area/facet): description` for commit subjects.

Allowed types are `feat`, `fix`, `refactor`, `docs`, `test`, and `chore`.

## Documentation policy

Use ASD-STE100 Simplified Technical English.

Update the applicable README when behavior, decisions, commands, boundaries, or gotchas change.

Keep durable current guidance in the README body.

Keep dated historical facts only in each README `Change log` section.

Keep the master flow and facet map in `docs/system-design.md`.

Keep detailed decisions and trade-offs in the relevant design facet under `docs/`.

Keep test plans and acceptance criteria in `docs/testing-strategy.md`.

Keep sequencing and open implementation choices in `docs/implementation-roadmap.md`.

## Incremental work policy

Do not implement runtime features in a design-only increment.

Present at least two implementation angles for each future feature increment.

Obtain a user choice when the angles change behavior, risk, or system boundaries.

Do not add speculative abstractions, migrations, Docker files, or runtime configuration.

## Planned verification

Use test-driven development for backend changes. Write a focused test first and run it to confirm it fails for the expected reason. Then implement the smallest change and rerun the focused test and full backend test suite. Run code generation before tests when the change depends on generated API files.

Future increments plan these verification categories:

- TypeScript and package validation.
- Vitest unit tests.
- Integration tests against MongoDB, Valkey, and LocalStack.
- Playwright browser tests.
- k6 stress tests.
- `git diff --check` and review of the final worktree.

`pnpm generate:api` bundles OpenAPI YAML and writes ignored schemas, Express routers, handler bindings, and browser clients. Keep all generated output ignored. No database migration exists.

## Local services and URLs

The API dev server uses port `3001` by default. The storefront reads `NEXT_PUBLIC_API_BASE_URL` at build time. No other local URL is defined.
