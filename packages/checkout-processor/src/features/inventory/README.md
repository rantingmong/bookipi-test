# inventory

## Purpose

This feature claims one published slot from Valkey.

## Flow

The processor checks publication and sale time in one Valkey script. It then pops one slot and records its `orderId` owner. The backend listing feature owns guarded release.

## Decisions & assumptions

- The pool contains every physical listing slot.
- Valkey runs the claim as a Lua script. Its keys use the listing ID hash tag.
- The order transition and its durable release intent belong to the backend and remain outside this feature.

## Gotchas

A missing listing, unpublished listing, closed sale window, or empty pool returns no slot.

## Change log

### 2026-09-24

- Added the atomic slot claim operation.
