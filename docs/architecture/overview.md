# Architecture Overview

## Intent

NBCP is a **modular monolith** delivered as a **pnpm + Turborepo monorepo**. Shared business capabilities live in domain modules; vertical products compose those modules; deployable apps host runtimes.

```text
Products (Restaurant / Hotel / POS / Clinic / School / Property)
        │
        ▼
Application hosts (API, worker, web)     ← apps/ (future)
        │
        ▼
Platform modules (identity, tenancy, …)  ← modules/ (future)
        │
        ▼
Shared packages (config, UI, contracts)  ← packages/ (future)
        │
        ▼
PostgreSQL (Supabase) · Redis · Object storage
```

## Design pillars

1. **Clear boundaries** — Modules expose public facades; infrastructure details stay private.
2. **Domain map** — Core Platform, Shared Business, and Product-Specific layers per [domain-map.md](domain-map.md) ([ADR-0002](../adr/0002-domain-map.md)).
3. **Tenancy first** — Organization-scoped data and deny-by-default authorization.
4. **Contract-driven APIs** — OpenAPI as the external contract source (when APIs exist).
5. **Extractable modules** — Structure allows later service extraction without rewriting domain logic.
6. **Docs-as-code** — ADRs and standards travel with the repository.

## Technology baseline

See [ADR-0001](../adr/0001-platform-technology-foundation.md):

- TypeScript, NestJS, Next.js
- PostgreSQL on Supabase, Prisma
- Redis, BullMQ
- pnpm, Turborepo

## Current phase

**Phase 0.1** establishes repository layout, documentation, and workspace configuration only. No application hosts, modules, or database schemas are present yet.
