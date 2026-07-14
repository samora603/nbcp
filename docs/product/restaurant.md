# Restaurant ERP (Product Notes)

## Intent

Compose NBCP kernel modules with restaurant-specific capabilities (e.g., table service, recipes/COGS, floor operations) without forking the platform.

## Planned shared / core dependencies

Per [domain map](../architecture/domain-map.md) / [ADR-0002](../adr/0002-domain-map.md):

- Core: identity, tenancy, rbac, audit
- Shared: parties, catalog, orders, payments, ledger, inventory
- Shared (as needed): scheduling (shifts/resources only — **not** dining reservations), notifications

## Product-specific contexts (future)

- Dining floor / table management
- **Reservations** (covers, waitlist, table holds) — restaurant-only; do not place in `scheduling` as `Reservation`
- Menu presentation (over catalog)
- Kitchen / order flow integrations (consume `orders`; do not own order lifecycle)
- Recipes / COGS (optional; compose catalog + inventory)

## Status

Placeholder — no product application code in Phase 0.1. Folder: `products/restaurant/`.
