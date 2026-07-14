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
- [ADR-0004](docs/adr/0004-event-retention-replay-rebuild.md) (Accepted — event retention, replay, rebuild).
- [Event catalog](docs/reference/event-catalog.md) (authoritative domain-event inventory; remediates hardening S-02 / P-02).
- [ADR-0005](docs/adr/0005-financial-truth-and-projection-ownership.md) (Accepted — financial truth and projection ownership; remediates hardening S-03).
- [ADR-0006](docs/adr/0006-architecture-enforcement-and-governance.md) (Accepted — architecture enforcement and governance; remediates hardening P-01 / P-03 / P-09).
- [ADR-0007](docs/adr/0007-orders-inventory-reservation-and-issue-timing.md) (Accepted — Orders ↔ Inventory reservation at commit, issue at fulfill).
- Implementation readiness package: [permission catalog](docs/reference/permission-catalog.md), [event-replay](docs/runbooks/event-replay.md) / [tenant](docs/runbooks/tenant-projection-rebuild.md) / [full](docs/runbooks/full-reporting-rebuild.md) rebuild runbooks, [bootstrap checklist](docs/implementation/bootstrap-checklist.md), [core bootstrap plan](docs/implementation/core-bootstrap-plan.md), [architecture automation backlog](docs/implementation/architecture-automation-backlog.md).
- [Core platform execution plan](docs/implementation/core-platform-execution-plan.md) (detailed Core phases, DoD, Shared exit criteria).
- [Core kernel backlog](docs/implementation/core-kernel-backlog.md) (WP-01…06 work packages, milestones M1–M6).
- [WP-01 outbox implementation package](docs/implementation/wp-01-outbox-implementation-package.md) (pre-code Outbox Foundation briefing).
- [Architecture readiness reassessment](docs/reviews/architecture-readiness-reassessment.md) (8.5/10 — ready for implementation).
- **`@nbcp/outbox`** (`packages/outbox`) — WP-01 Outbox Foundation / M1: envelope validation, unit-of-work staging, outbox store port + in-memory adapter, relay with poison quarantine, archive seam, consumer idempotency, replay hooks, architecture/unit/integration tests.
- **`@nbcp/identity`** (`modules/identity`) — WP-02 Identity / M2: principal lifecycle, sessions, password reset, external links; SECURITY events via `@nbcp/outbox`; zero module deps; unit/integration/architecture tests.
- **`@nbcp/tenancy`** (`modules/tenancy`) — WP-03 Tenancy / M3: organizations, locations, memberships, invitations; Identity facade only; invitation email-bind; outbox events; tests green.

### Changed

- Root workspace scripts now delegate `test` / `typecheck` / `build` to packages via pnpm filters when present.
