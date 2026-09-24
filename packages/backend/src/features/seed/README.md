# Demo seed feature

`feature.ts` defines a deterministic listing for local tests and demos. It calls `createListing` in the listing feature.

The `pnpm --filter @bookipi/backend seed` command creates the listing and publishes ten slots to Valkey. Set `MONGODB_URI`, `MONGODB_DATABASE`, and `VALKEY_URL` first. This seed is one-shot; a second run with the same listing ID fails.

## Change log

### 2026-09-24

- Moved the demo seed out of the listing feature and made it call `createListing`.
