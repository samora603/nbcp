# Modules

Domain modules (Core Platform, Shared Business, and Product-Specific capabilities) live here.

## Standards

| Document | Role |
| --- | --- |
| [Domain map](../docs/architecture/domain-map.md) | Which modules exist and their layer |
| [Module standard](../docs/architecture/module-standard.md) | Mandatory internal structure and bans |
| [ADR-0002](../docs/adr/0002-domain-map.md) | Domain map decision |
| [ADR-0001](../docs/adr/0001-platform-technology-foundation.md) | NestJS + Prisma modular monolith |

## Creating a module

1. Copy [`_templates/domain-module/`](_templates/domain-module/) to `modules/<name>/`.
2. Rename the `Example` demo language to your domain.
3. Register the Nest module in the API host when apps exist.
4. Export only the public facade from `src/index.ts`.

## Modules in repo

| Package | Layer | Status |
| --- | --- | --- |
| [`identity`](identity/) (`@nbcp/identity`) | Core | WP-02 / M2 implemented (facade + in-memory persistence; Nest host deferred) |
| [`tenancy`](tenancy/) (`@nbcp/tenancy`) | Core | WP-03 / M3 implemented (orgs, memberships, invitations; Identity facade only) |
| [`rbac`](rbac/) (`@nbcp/rbac`) | Core | WP-04 / M4 implemented (catalog permissions, roles, authorize, org admin bootstrap) |
| [`audit`](audit/) (`@nbcp/audit`) | Core | WP-05 / M5 implemented (append-only trail; SECURITY event projection; query) |

## Template

`_templates/domain-module` is a **canonical structure demo**, not a business feature. It is not intended as a pnpm workspace package for production use.

