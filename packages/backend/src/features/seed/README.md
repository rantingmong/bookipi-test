# Demo seed feature

`feature.ts` defines a default listing for local tests and demos. It calls `createListing` in the listing feature. The seed accepts optional ID and sale-window overrides so an integration run can use a unique active listing.

The `pnpm --filter @bookipi/backend seed` command creates the listing and publishes ten slots to Valkey. Set `MONGODB_URI`, `MONGODB_DATABASE`, and `VALKEY_URL` first. The command accepts a second run when the listing, slots, and published Valkey inventory match the same configuration. It fails closed when any existing seed facts differ. Set `DEMO_SALE_STARTS_AT` and `DEMO_SALE_ENDS_AT` to make the sale active during an integration run.

## Change log

### 2026-09-24

- Moved the demo seed out of the listing feature and made it call `createListing`.
