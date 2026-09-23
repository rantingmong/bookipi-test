# Repository instructions

## Repository map

This repository contains a pnpm monorepo for a high-throughput Bookipi flash sale.

- `packages/backend` contains the planned Express API, Better Auth integration, inventory setup, reads, and durable consumers.
- `packages/storefront` contains the planned Next.js user interface.
- `packages/checkout-processor` contains the planned AWS Lambda checkout processor.
- `docs` contains design, test, and implementation planning documents.

Read the root `README.md` and every applicable directory `README.md` before work.

## Toolchain

- Use pnpm for package management.
- Use Node.js 24 and TypeScript.
- Use ECMAScript modules with `"type": "module"`.
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

Keep design decisions and trade-offs in `docs/system-design.md`.

Keep test plans and acceptance criteria in `docs/testing-strategy.md`.

Keep sequencing and open implementation choices in `docs/implementation-roadmap.md`.

## Incremental work policy

Do not implement runtime features in a design-only increment.

Present at least two implementation angles for each future feature increment.

Obtain a user choice when the angles change behavior, risk, or system boundaries.

Do not add speculative abstractions, dependencies, migrations, code generation, Docker files, or runtime configuration.

## Planned verification

Future increments plan these verification categories:

- TypeScript and package validation.
- Vitest unit tests.
- Integration tests against MongoDB, Valkey, and LocalStack.
- Playwright browser tests.
- k6 stress tests.
- `git diff --check` and review of the final worktree.

No code generation or database migration exists in this increment.

## Local services and URLs

Local API, storefront, Lambda, MongoDB, Valkey, and LocalStack URLs are planned only.

No local URL is available in this increment.
