# Changelog

All notable changes to the Noventra Business Core Platform (NBCP) are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project will adhere to [Semantic Versioning](https://semver.org/spec/v2.0.0.html) once versioned releases begin.

---

## [Unreleased]

### Added

- Phase 0.1 repository foundation: monorepo layout, workspace configuration, and engineering documentation.
- Architecture Decision Record [ADR-0001](docs/adr/0001-platform-technology-foundation.md) (modular monolith and technology baseline).
- Cursor Prompt Library under `.cursor/` (foundation prompt, architecture review prompt, engineering rules).
- Definitive [domain map](docs/architecture/domain-map.md) and [ADR-0002](docs/adr/0002-domain-map.md) (core / shared / product domains).
- [Module standard](docs/architecture/module-standard.md) and canonical template under `modules/_templates/domain-module/`.
- [Identity module design](docs/modules/identity/design.md) (Core Platform — documentation only).
- [Tenancy module design](docs/modules/tenancy/design.md) (Core Platform — documentation only).
- [RBAC module design](docs/modules/rbac/design.md) (Core Platform — documentation only).
- [Audit module design](docs/modules/audit/design.md) (Core Platform — documentation only).
- [Kernel architecture review](docs/reviews/kernel-review.md) (Identity / Tenancy / RBAC / Audit).
- [ADR-0003](docs/adr/0003-event-contracts-and-outbox.md) / [event contracts](docs/architecture/event-contracts.md); [tenant access model](docs/architecture/tenant-access-model.md); [invitation acceptance policy](docs/architecture/invitation-acceptance-policy.md) (remediate K-01…K-05).
- [Parties module design](docs/modules/parties/design.md) (Shared Business — canonical business actors).
- [Business capability map](docs/architecture/business-capability-map.md); [Catalog module design](docs/modules/catalog/design.md).
- [Orders module design](docs/modules/orders/design.md) (Shared Business — commercial commitments).
- [Inventory module design](docs/modules/inventory/design.md) (Shared Business — stock movements).
- [Ledger module design](docs/modules/ledger/design.md) (Shared Business — append-only accounting).
- [Payments module design](docs/modules/payments/design.md) (Shared Business — intents, capture, refunds).
- [Scheduling module design](docs/modules/scheduling/design.md) (Shared Business — resources & allocations).
- [Notifications module design](docs/modules/notifications/design.md) (Shared Business — templates & dispatch).
- [Reporting module design](docs/modules/reporting/design.md) (Shared Business — projections & exports).
- [Shared domains review](docs/reviews/shared-domains-review.md); [Platform architecture review](docs/reviews/platform-architecture-review.md).
- [Architecture hardening review](docs/reviews/architecture-hardening-review.md) (conditionally ready — governance gaps before money path).
- [ADR-0004](docs/adr/0004-event-retention-replay-rebuild.md) (Proposed — event retention, replay, rebuild).
- [Event catalog](docs/reference/event-catalog.md) (authoritative domain-event inventory; remediates hardening S-02 / P-02).
- [ADR-0005](docs/adr/0005-financial-truth-and-projection-ownership.md) (Proposed — financial truth and projection ownership; remediates hardening S-03).
- [ADR-0006](docs/adr/0006-architecture-enforcement-and-governance.md) (Proposed — architecture enforcement and governance; remediates hardening P-01 / P-03 / P-09).

---

## Release notes policy

- `Added` — new capabilities
- `Changed` — changes in existing behavior
- `Deprecated` — soon-to-be removed features
- `Removed` — removed features
- `Fixed` — bug fixes
- `Security` — vulnerability fixes

Breaking changes must be called out explicitly under `Changed` or `Removed` and referenced from relevant ADRs or migration notes.
