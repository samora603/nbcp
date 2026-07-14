# Platform Vision

## What NBCP is

The **Noventra Business Core Platform (NBCP)** is a reusable, multi-tenant business platform that powers multiple Noventra enterprise products. It centralizes shared commercial and operational capabilities so product teams compose solutions instead of rebuilding foundations.

## What success looks like

- A new vertical can assemble identity, tenancy, RBAC, audit, and shared commercial primitives without forking the platform.
- Engineering standards are consistent across products (structure, testing, security, observability).
- The repository remains maintainable for 10+ years through modular boundaries and documented decisions.
- Operational quality (observability, incident response, secure defaults) is inherited by every product.

## Goals

1. **Platform reuse** — Shared kernel modules and packages.
2. **Product velocity** — Thin product shells over stable capabilities.
3. **Secure multi-tenancy** — Organization isolation as a default invariant.
4. **Extractability** — Modular monolith today; service extraction criteria later.
5. **Excellent DX** — Generators, docs, CI, and predictable layouts.

## Non-goals (near term)

- Premature microservices or service mesh complexity
- Building every vertical’s full domain in the kernel
- Multi-region active-active deployment in early phases
- Dual public API styles (REST + GraphQL) before a clear need
- Mobile-native clients in Phase 1 (APIs will later support them)

## Guiding principles

- Prefer clarity over cleverness
- Boundaries over sprawl
- Security and tenancy before features
- Documentation of decisions (ADRs) over tribal knowledge
- Measure twice: architecture reviews before expensive abstractions

## Status

Vision is active as of Phase 0.1. Implementation of modules and apps begins only after explicit Phase 1 approval.
