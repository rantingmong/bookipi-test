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
- Use backend `#app`, `#api/*`, `#features/*`, `#services/*`, and `#types` package imports. Use the storefront `@/*` TypeScript alias.
- Do not add npm or Yarn lockfiles.
- Do not guess commands. Confirm a command in a manifest or document before use.
- Use the root Prettier configuration. Run `pnpm format:check` before completion.
- Do not use ternary expressions. Use clear `if` statements or an IIFE when an expression is required.
- Do not chain `??` defaults. Use ordered `if` statements when several fallbacks exist.

## Backend implementation decisions

- Put domain behavior in `src/features/<name>` and external integrations in `src/services/<name>`.
- Give each implemented feature a `README.md`, `feature.ts`, and focused `feature.test.ts`.
- Use `schema.ts` for externally defined Zod schemas, `constants.ts` for internal constants, `types.ts` for internal types, and `models.ts` for Mongoose models in backend features.
- Use `schema.ts` for externally defined Zod schemas, `constants.ts` for internal constants, and `types.ts` for internal types in backend services.
- Keep environment parsing in `src/features/env`. Pass validated settings into features and services.
- Do not connect services or read required environment settings during a feature import.
- Mount Better Auth before Express JSON parsing because Better Auth needs the raw request body.
- Store Better Auth users and credentials in MongoDB. Store sessions only in Valkey secondary storage.
- Do not add a MongoDB session fallback. A Valkey loss signs customers out.
- Use one validated storefront origin for Better Auth trusted origins and Express CORS.

## Lambda package organization

Use the same source layout in `packages/checkout-authorizer` and `packages/checkout-processor`.

- Put domain behavior in `src/features/<name>`.
- Give each implemented feature a `README.md`, `feature.ts`, and focused `feature.test.ts`.
- Put external integrations in `src/services/<name>`.
- Parse required environment settings in `src/features/env` and pass validated settings into features and services.
- Do not connect services or read required environment settings during a feature import.

## Storefront implementation decisions

- Keep page UI in `src/app/<page>/page.tsx` and page state in `page.state.tsx`.
- Keep generated clients behind tracked wrappers in `src/lib/features`.
- Use React Hook Form for forms. Expose only `register`, a wrapped `submit`, and `formState` when practical.
- Use `useSWRMutation` for user-triggered writes. Derive request feedback from mutation data and errors.
- Keep changing UI state elements mounted. Use parent data attributes and Tailwind `group-data-*` visibility utilities.
- Do not use conditional JSX for changing state elements. This avoids conflicts with browser translation engines.
- Keep the session panel as the current identity source. Refresh it in the background after an auth write.
- Tailwind uses theme and utility layers only. Do not enable Preflight without an explicit design decision.

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
