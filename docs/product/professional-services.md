# Professional Services (Product Notes)

## Intent

Compose NBCP shared business domains for professional-services firms (consultancies, agencies, practices): client engagements, time, deliverables, and billing UX — without forking the platform.

## Planned core / shared dependencies

Per [domain map](../architecture/domain-map.md) / [ADR-0002](../adr/0002-domain-map.md):

- Core: identity, tenancy, rbac, audit, files, workflow
- Shared: parties, catalog, orders, payments, ledger
- Shared (as needed): scheduling (time blocks), notifications, reporting

## Product-specific contexts (future)

- Engagements / matters
- Time & billing presentation
- Deliverables tracking

## Status

Placeholder aligned to ADR-0002. Folder: `products/professional-services/` (scaffold when Phase 1 product shells are expanded).
