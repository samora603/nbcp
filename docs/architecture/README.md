# Architecture Documentation

This section describes how NBCP is structured and why. Authoritative decisions live in [ADRs](../adr/README.md).

| Document | Summary |
| --- | --- |
| [overview.md](overview.md) | Platform architecture at a glance |
| [domain-map.md](domain-map.md) | Definitive core / shared / product domain map ([ADR-0002](../adr/0002-domain-map.md)) |
| [business-capability-map.md](business-capability-map.md) | Shared capabilities × vertical products (platform-orientation check) |
| [module-standard.md](module-standard.md) | Mandatory module structure, boundaries, and prohibited patterns |
| [modular-monolith.md](modular-monolith.md) | Modular monolith approach and rules |
| [../modules/](../modules/README.md) | Per-module design documents (identity, tenancy, rbac, audit, …) |
| [../reviews/](../reviews/README.md) | Architecture reviews (e.g. kernel review) |
| [tenancy-model.md](tenancy-model.md) | Multi-tenant organization model |
| [tenant-access-model.md](tenant-access-model.md) | Ownership, membership, location vs RBAC scope, org bootstrap (K-02/K-03) |
| [invitation-acceptance-policy.md](invitation-acceptance-policy.md) | Invitation accept / email bind rules (K-05) |
| [authz-model.md](authz-model.md) | Authorization approach |
| [data-architecture.md](data-architecture.md) | PostgreSQL / Prisma / Supabase data approach |
| [eventing.md](eventing.md) | Domain events overview |
| [event-contracts.md](event-contracts.md) | Event envelope, outbox, idempotent consumers ([ADR-0003](../adr/0003-event-contracts-and-outbox.md)) |
| [api-strategy.md](api-strategy.md) | Public and internal API strategy |
| [frontend-architecture.md](frontend-architecture.md) | Next.js and design-system direction |
| [deployment-topology.md](deployment-topology.md) | Environments and hosting topology |
