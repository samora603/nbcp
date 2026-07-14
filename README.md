# NBCP — Noventra Business Core Platform

**NBCP** is Noventra's reusable enterprise business platform. It is not a single application. It is the shared foundation that will power multiple commercial products for the next decade and beyond.

---

## Vision

Build the platform once. Compose many products.

NBCP provides the durable kernels of multi-tenant business software — identity, tenancy, authorization, audit, billing primitives, shared commercial capabilities, design system, observability, and engineering standards — so every Noventra product ships faster without reinventing the core.

Future products that consume NBCP include:

- Restaurant ERP
- Hotel Management System
- Retail POS
- Clinic Management System
- School Management System
- Property Management System
- Additional SaaS products over time

---

## Goals

1. **Reuse over rewrite** — Shared modules power every vertical; product-specific logic stays in product compositions.
2. **Production quality from day one** — Security, tenancy isolation, observability, and testing are platform concerns, not afterthoughts.
3. **Modular longevity** — Clear boundaries enable a 10+ year maintenance horizon without architectural decay.
4. **Developer experience** — Predictable structure, generators, and docs so engineers can move confidently.
5. **Extractable design** — Start as a modular monolith; keep modules service-extractable when scale or compliance demands it.

---

## High-Level Architecture

NBCP is a **modular monolith** monorepo:

| Layer | Role |
| --- | --- |
| **Products** (`products/`) | Thin vertical compositions (Restaurant, Hotel, POS, …) |
| **Apps** (`apps/`) | Deployable hosts (API, workers, web shells) — scaffolded in later phases |
| **Modules** (`modules/`) | Domain capabilities (identity, tenancy, inventory, ledger, …) |
| **Packages** (`packages/`) | Shared technical libraries (config, UI, contracts, telemetry) |
| **Infra** (`infra/`) | Docker, Terraform, and environment topology |
| **Docs** (`docs/`) | Architecture, ADRs, standards, and runbooks |

**Technology baseline (architectural decisions — see [ADR-0001](docs/adr/0001-platform-technology-foundation.md)):**

- TypeScript (strict)
- NestJS (API / modular host)
- Next.js (web applications)
- PostgreSQL hosted on **Supabase**
- Prisma (data access / migrations)
- Redis + BullMQ (jobs / queues)
- pnpm workspaces + Turborepo

Multi-tenancy (organization-scoped data) is a first-class platform invariant.

---

## Repository Layout

```text
nbcp/
├── apps/                 # Deployable applications (future)
├── products/             # Vertical product shells
├── packages/             # Shared libraries (future)
├── modules/              # Domain modules (future)
├── tooling/              # Generators and engineering scripts
├── infra/                # Docker, Terraform, ops topology
├── docs/                 # Architecture & engineering documentation
├── tests/                # Cross-cutting e2e / contract / load suites
├── .github/              # CI/CD and repository templates
├── package.json          # Workspace root
├── pnpm-workspace.yaml
└── turbo.json
```

> **Phase status:** Phase 0.1 establishes repository foundation only. Application code, APIs, database models, and business modules are intentionally absent.

---

## Development Philosophy

- Optimize for **maintainability, security, and modularity** — never for shortcuts.
- Prefer **Clean Architecture / hexagonal module boundaries** with SOLID principles.
- Apply **Domain-Driven Design** where bounded contexts clarify ownership.
- Document decisions as **ADRs**; keep a living **glossary** and engineering standards.
- Use **trunk-based development**, Conventional Commits, and CI-gated merges to `main`.
- Enforce **deny-by-default authorization** and tenant isolation when modules arrive.

---

## Documentation

| Document | Purpose |
| --- | --- |
| [Contributing](CONTRIBUTING.md) | How to contribute |
| [Security](SECURITY.md) | Vulnerability reporting |
| [Code of Conduct](CODE_OF_CONDUCT.md) | Community standards |
| [Changelog](CHANGELOG.md) | Release history |
| [Docs index](docs/README.md) | Full documentation map |
| [Architecture overview](docs/architecture/overview.md) | Platform architecture |
| [ADR index](docs/adr/README.md) | Architecture decisions |

---

## Getting Started (Foundation Only)

This repository is currently in **foundation phase**.

- Node.js version: see [`.nvmrc`](.nvmrc) (Node 22+)
- Package manager: **pnpm** (declared via `packageManager` in `package.json`)
- Workspace config: `pnpm-workspace.yaml` + `turbo.json`

Do **not** expect runnable applications yet. Scaffolding of apps, modules, and packages begins in Phase 1 after approval.

```bash
# Optional: confirm Node version
node -v   # expect v22.x

# Dependencies are not installed in Phase 0.1
# pnpm install will be introduced when packages are scaffolded
```

---

## License

Proprietary. Copyright © Noventra. All rights reserved.  
See [LICENSE](LICENSE).

---

## Status

| Phase | Description | State |
| --- | --- | --- |
| 0 | Architecture Foundation Report | Complete |
| 0.1 | Repository foundation | In progress |
| 1 | Core platform skeleton (identity, tenancy, tooling) | Not started |

Treat this repository as a long-term Noventra software asset.
