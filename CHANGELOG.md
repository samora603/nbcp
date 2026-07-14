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

---

## Release notes policy

- `Added` — new capabilities
- `Changed` — changes in existing behavior
- `Deprecated` — soon-to-be removed features
- `Removed` — removed features
- `Fixed` — bug fixes
- `Security` — vulnerability fixes

Breaking changes must be called out explicitly under `Changed` or `Removed` and referenced from relevant ADRs or migration notes.
