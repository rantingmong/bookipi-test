# Demo seed feature

`feature.ts` defines a default listing for local tests and demos. It calls `createListing` in the listing feature. The seed accepts optional listing ID, sale window, initial slot count, and reserve count overrides.

The `pnpm --filter @bookipi/backend seed` command creates the listing and publishes ten slots to Valkey by default. It sets `reserveSlots` to two. Set `MONGODB_URI`, `MONGODB_DATABASE`, and `VALKEY_URL` first. Set `DEMO_INITIAL_SLOT_COUNT` to a positive integer to change the slot count. Set `DEMO_RESERVE_SLOTS` to a non-negative integer to change the reserve count. The reserve count cannot exceed the slot count. Set `DEMO_SALE_STARTS_AT` and `DEMO_SALE_ENDS_AT` to make the sale active during an integration run.

The command accepts a second run when the listing, slots, and published Valkey inventory match the same configuration. It fails closed when any existing seed facts differ.

## Change log

### 2026-09-24

- Moved the demo seed out of the listing feature and made it call `createListing`.
