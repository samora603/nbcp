# ADR-0001: Platform Technology & Modular Monolith Foundation

- **Status:** Accepted
- **Date:** 2026-07-14
- **Deciders:** Noventra platform architecture (Phase 0 approval)
- **Tags:** architecture, monorepo, stack, data, frontend, backend

## Context

NBCP must serve as a long-lived, multi-tenant business platform that powers many Noventra products (Restaurant ERP, Hotel HMS, Retail POS, Clinic, School, Property Management, and future SaaS). The organization needs a coherent engineering foundation that prioritizes maintainability, security, modularity, and developer experience for 10+ years.

Phase 0 established the Architecture Foundation Report. This ADR locks the foundational technology and structural choices so Phase 0.1 repository work and later phases share a single baseline.

## Decision

We will build NBCP as follows:

### Architecture style

- **Modular monolith** as the default delivery style.
- Clear hexagonal / Clean Architecture module boundaries.
- Service extraction only when defined extraction criteria are met (see `docs/architecture/modular-monolith.md`).

### Repository & tooling

- **Monorepo** ownership of apps, products, modules, packages, infra, and docs.
- **pnpm** workspaces for package management.
- **Turborepo** for task orchestration and build caching.

### Backend

- **TypeScript** (strict) as the primary language.
- **NestJS** as the API / modular application host framework.

### Frontend

- **Next.js** (App Router) for web applications and product shells.
- Shared design system approach via future `packages/ui` (not scaffolded in Phase 0.1).

### Data & infrastructure

- **PostgreSQL** as the system of record.
- **Supabase** as the hosted PostgreSQL (and related) infrastructure platform.
- **Prisma** as the ORM and migration tool.
- **Redis** for ephemeral concerns (queues, locks, rate limits).
- **BullMQ** for background job processing.

### Explicit non-decisions deferred

- Exact cloud compute hosting for app runtimes (PaaS vs Kubernetes) — future ADR.
- Auth provider product selection — future ADR during identity work.
- GraphQL adoption — deferred unless a clear need emerges.

## Consequences

### Positive

- Shared TypeScript types and tooling across frontend and backend.
- NestJS module system aligns with domain module ownership.
- Supabase accelerates managed Postgres operations (backups, connectivity, ecosystem).
- Prisma provides strong migration discipline and developer ergonomics.
- pnpm + Turborepo scale cleanly as the monorepo grows.
- Modular monolith avoids premature distributed-systems cost.

### Negative / Trade-offs

- Monorepo requires boundary linting, CODEOWNERS, and CI discipline.
- NestJS adds framework ceremony — domain layers must stay framework-free.
- Prisma may need escape hatches for complex analytical SQL later.
- Supabase coupling for hosted Postgres requires clear env separation and portability principles (standard Postgres dialect remains the logical model).
- Modular monolith can become a “distributed monolith of modules” without enforcement.

### Follow-ups

- Phase 0.1: repository layout, docs, workspace config (this workstream).
- Phase 1: scaffold apps/modules tooling; identity & tenancy skeletons.
- Add ADRs for auth provider, secrets management, and production compute topology.
- Introduce dependency-boundary tooling when packages exist.

## Alternatives Considered

| Alternative | Why not chosen as default |
| --- | --- |
| Microservices from day one | High ops overhead before product leverage exists |
| Polyrepo per product | Weakens shared standards and atomic platform refactors |
| MongoDB as primary store | Poor fit for relational ERP / ledger invariants |
| Go / .NET / Java backends | Strong runtimes, but weaker shared-type DX with TS frontends for this org’s goals |
| Drizzle instead of Prisma | Viable; Prisma selected for Phase 1 velocity and migration DX |
| Self-managed Postgres only | Higher ops burden early; Supabase chosen as managed host |

## References

- `docs/architecture/overview.md`
- `docs/architecture/modular-monolith.md`
- `docs/architecture/data-architecture.md`
- Phase 0 Architecture Foundation Report (approved)
