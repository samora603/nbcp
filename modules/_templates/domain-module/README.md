# Domain Module Template (`_templates/domain-module`)

**Purpose:** Canonical copy-source for every NBCP domain module.  
**Standard:** [`docs/architecture/module-standard.md`](../../../docs/architecture/module-standard.md)  
**Stack:** NestJS (wiring/transport) + Prisma (persistence adapter) — placeholders only.

This is **not** a business module. Names use the fictional `Example` / `example` ubiquitous language so nothing industry-specific leaks into Core or Shared domains.

## How to use

1. Copy this directory to `modules/<name>/`.
2. Rename `example` → your module name (package, classes, table prefix).
3. Confirm placement against [ADR-0002 domain map](../../../docs/adr/0002-domain-map.md).
4. Delete unused demo files; keep the layering.
5. Do not import this template package from apps — it is not a workspace feature module.

## Demo surface

| Artifact | Path |
| --- | --- |
| Aggregate | `src/domain/entities/example.aggregate.ts` |
| Repository port | `src/domain/repositories/example.repository.ts` |
| Domain event | `src/domain/events/example-created.event.ts` |
| Use case | `src/application/use-cases/create-example.use-case.ts` |
| Prisma repository stub | `src/infrastructure/persistence/prisma-example.repository.ts` |
| Controller | `src/api/controllers/example.controller.ts` |
| Event publisher port | `src/application/ports/event-publisher.port.ts` |
| Event handler stub | `src/events/handlers/example-foreign.handler.ts` |
| Public facade | `src/index.ts` |

## Non-goals

- No real Prisma schema generation or Nest bootstrap in this template.
- No restaurant, hotel, or other vertical logic.
- No authentication implementation — only structural hooks.
