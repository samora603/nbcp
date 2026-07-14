# Implementation Bootstrap Checklist

**Status:** Normative gates for Phase 1 scaffolding  
**Related:** [core-bootstrap-plan.md](core-bootstrap-plan.md), [architecture-automation-backlog.md](architecture-automation-backlog.md), [ADR-0006](../adr/0006-architecture-enforcement-and-governance.md), [Readiness reassessment](../reviews/architecture-readiness-reassessment.md)  
**Last updated:** 2026-07-14  

Use this checklist as **exit criteria** before expanding scope. Each item needs an objective “done” signal — not a vibe.

Legend: `[ ]` pending · `[x]` complete (mark in implementation PRs / project tracker; this file stays the template unless consciously updated).

---

## 0. Architecture (pre-code / sprint zero)

| # | Gate | Completion criteria |
| --- | --- | --- |
| A1 | ADRs 0001–0006 Accepted | ADR index shows Accepted for 0001–0006 |
| A2 | Event catalog published | [event-catalog.md](../reference/event-catalog.md) present; classifications assigned |
| A3 | Permission catalog published | [permission-catalog.md](../reference/permission-catalog.md) present |
| A4 | Rebuild/replay runbooks | [event-replay.md](../runbooks/event-replay.md), [tenant-projection-rebuild.md](../runbooks/tenant-projection-rebuild.md), [full-reporting-rebuild.md](../runbooks/full-reporting-rebuild.md) |
| A5 | Financial ownership clear | ADR-0005 Accepted; Payments↛Ledger; Reporting derived |
| A6 | Enforcement policy clear | ADR-0006 Accepted; automation backlog filed |
| A7 | Domain map followed | New modules only per ADR-0002 / domain-map |

**Exit:** All A1–A7 true → begin Core code scaffolding.

---

## 1. Core Platform

| # | Gate | Completion criteria |
| --- | --- | --- |
| C1 | Outbox technical foundation | Persist aggregate + outbox in one unit of work; relay exists (even stub) | [x] |
| C2 | Envelope validation | Publisher rejects incomplete envelopes (ADR-0003) | [x] |
| C3 | Identity module | Facade + tables; zero module deps; SECURITY events via outbox | [x] |
| C4 | Tenancy module | Org/location/membership/invitation; depends only Identity as designed | [x] |
| C5 | RBAC module | Permissions/roles/assignments; org admin bootstrap composer | [x] |
| C6 | Audit module | Append-only; consumes Identity/Tenancy/RBAC events; no reverse deps from Identity/Tenancy/RBAC | [x] |
| C7 | Tenant access | org create → admin role assignment without owner bypass | [x] |
| C8 | Invitation policy | Email mismatch deny per invitation-acceptance-policy | [x] |
| C9 | Architecture tests (kernel) | Identity isolation; Identity/Tenancy/RBAC ↛ Audit; SECURITY mutation ⇒ outbox row | [x] |

**Exit:** C1–C9 green in CI → Shared domains may start.

---

## 2. Shared Domains

| # | Gate | Completion criteria |
| --- | --- | --- |
| S1 | Parties | Facade + events in catalog; permissions seeded | [x] `@nbcp/parties` |
| S2 | Catalog | Items/prices; events catalogued | [x] `@nbcp/catalog` |
| S3 | Orders | Commit/cancel path; outbox on material events | [x] `@nbcp/orders` |
| S4 | Payments | Capture/refund SoR; **no** ledger table writes |
| S5 | Ledger | Journals append-only; projector on capture per ADR-0005; idempotent `externalRef` |
| S6 | Inventory | Movements; fulfillment timing policy documented before auto-handlers |
| S7 | Reporting | Facts rebuildable; tooling cannot truncate non-Reporting stores |
| S8 | Permission sync | New keys in permission catalog + RBAC seed |
| S9 | Event catalog sync | Every emitted `type` has a row |

**Exit:** S1–S5 (min spine) before first product; S6–S7 before stock/analytics product claims; S8–S9 continuous.

---

## 3. Product Modules

| # | Gate | Completion criteria |
| --- | --- | --- |
| P1 | Product → Shared → Core only | Boundary check clean |
| P2 | No Shared schema for vertical SoR | Product owns its tables; Shared referenced by id |
| P3 | Product event prefix | Prefixed types; annex or catalog note |
| P4 | Thin vertical | Composes Shared facades; no Payments→Ledger cheat |
| P5 | Guest/anonymous policy (if needed) | Explicit decision before POS guest checkout |

**Exit:** P1–P4 for first thin product launch candidate.

---

## 4. CI Enforcement (ADR-0006)

| # | Gate | Completion criteria |
| --- | --- | --- |
| E1 | Foundation file presence | Existing CI green | [x] |
| E2 | Boundary / dependency graph gate | Fails Shared→Product, Core→Shared, Identity→*, Payments→Ledger writes | [x] |
| E3 | Outbox architecture tests | Tagged suite on PR for SECURITY/FINANCIAL paths | [x] (SECURITY; FINANCIAL when modules exist) |
| E4 | Event catalog validation | Unknown publish `type` fails CI | [x] |
| E5 | Permission catalog validation | Unknown permission keys fail CI (when scanning enabled) | [x] (Core) |
| E6 | Doc presence for new modules | `docs/modules/<name>/design.md` required | [x] |
| E7 | Exception expiry | Temporary exceptions have dates; expired fail | [x] |

**Exit:** E2–E4 **blocking** on default branch before Shared commerce merge to main; E5–E7 progressive warn→fail.

---

## Sign-off

| Phase | Owner | Date | Notes |
| --- | --- | --- | --- |
| Architecture | | | |
| Core | | | |
| Shared spine | | | |
| CI enforcement | | | |
| First product | | | |
