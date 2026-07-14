# Implementation Documentation

Plans and checklists that gate Phase 1 scaffolding. Architecture ADRs remain authoritative for policy.

| Document | Purpose |
| --- | --- |
| [bootstrap-checklist.md](bootstrap-checklist.md) | Objective completion gates (Architecture → Product → CI) |
| [core-bootstrap-plan.md](core-bootstrap-plan.md) | Identity → Audit + outbox + enforcement sequence |
| [core-platform-execution-plan.md](core-platform-execution-plan.md) | Detailed Core execution phases, DoD, Shared exit criteria |
| [core-kernel-backlog.md](core-kernel-backlog.md) | Executable WP-01…06 backlog, milestones, testing strategy |
| [wp-01-outbox-implementation-package.md](wp-01-outbox-implementation-package.md) | Pre-code package for Outbox Foundation (M1) — **implemented** via `@nbcp/outbox` |
| [architecture-automation-backlog.md](architecture-automation-backlog.md) | ADR-0006 capabilities to automate (tool-agnostic) |
| [parties-implementation-package.md](parties-implementation-package.md) | Pre-code package for Shared **S1 Parties** — **implemented** via `@nbcp/parties` |
| [catalog-implementation-package.md](catalog-implementation-package.md) | Pre-code package for Shared **S2 Catalog** — **implemented** via `@nbcp/catalog` |
| [orders-implementation-package.md](orders-implementation-package.md) | Pre-code package for Shared **S3 Orders** — **implemented** via `@nbcp/orders` |

**Readiness:** [architecture-readiness-reassessment.md](../reviews/architecture-readiness-reassessment.md) · [kernel-completion-report.md](../reviews/kernel-completion-report.md)
