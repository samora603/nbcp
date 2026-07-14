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

## Template

`_templates/domain-module` is a **canonical structure demo**, not a business feature. It is not intended as a pnpm workspace package for production use.

**Status:** No production domain modules yet — template only.
