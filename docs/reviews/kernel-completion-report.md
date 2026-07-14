# Kernel Completion Report

| Field | Value |
| --- | --- |
| **Role** | Lead Architect |
| **Date** | 2026-07-14 |
| **Scope** | Core Kernel — WP-01…WP-06 / milestones M1…M6 |
| **Authority** | [core-kernel-backlog.md](../implementation/core-kernel-backlog.md) · [core-platform-execution-plan.md](../implementation/core-platform-execution-plan.md) · [bootstrap-checklist.md](../implementation/bootstrap-checklist.md) |
| **Policy** | ADR-0001…0007 · [event catalog](../reference/event-catalog.md) · [permission catalog](../reference/permission-catalog.md) |
| **Prior readiness** | [architecture-readiness-reassessment.md](architecture-readiness-reassessment.md) (8.5 — ready for Core scaffolding) |

---

## 1. Executive Summary

The **Core Kernel is complete**. Work packages WP-01 through WP-06 have delivered a working, enforceable kernel: transactional outbox, Identity, Tenancy, RBAC, Audit, and ADR-0006 architecture enforcement on CI.

| Milestone | Status | Package / artifact |
| --- | --- | --- |
| **M1** Kernel Foundation | **Achieved** | `@nbcp/outbox` |
| **M2** Identity Ready | **Achieved** | `@nbcp/identity` |
| **M3** Tenancy Ready | **Achieved** | `@nbcp/tenancy` |
| **M4** Authorization Ready | **Achieved** | `@nbcp/rbac` |
| **M5** Audit Ready | **Achieved** | `@nbcp/audit` |
| **M6** Kernel Complete | **Achieved** | `@nbcp/architecture-enforcement` + CI `governance` |

**Checklist:** C1–C9 green · E1–E7 satisfied for Core (E2–E4 **blocking**).  
**Exceptions:** No open Active kernel exceptions ([exceptions register](../adr/exceptions/README.md)).  
**Demo path:** Documented and covered by integration tests ([kernel-demo.md](../runbooks/kernel-demo.md)).

### Recommendation

**Proceed to Shared Domains.**

Parties, Catalog, and Orders may begin under the hard gate in the kernel backlog. Payments / Ledger / Inventory / Reporting remain sequenced per Shared checklist S1–S9 and ADR-0005.

---

## 2. M1 through M6 Outcomes

### M1 — Kernel Foundation (WP-01)

| Criterion | Outcome |
| --- | --- |
| Outbox atomicity | Aggregate mutation + outbox append share a unit of work |
| Envelope validation | Incomplete envelopes rejected (ADR-0003) |
| Relay | At-least-once publish with retry / poison quarantine |
| Replay hooks | `EventReplaySupport` + consumer `deliverIdempotent` |
| Checklist | C1, C2 |

### M2 — Identity Ready (WP-02)

| Criterion | Outcome |
| --- | --- |
| Principals / credentials / sessions | Local register, verify, authenticate, reset |
| SECURITY events | Catalog Identity types published via `@nbcp/outbox` |
| Isolation | Zero module dependencies; architecture tests enforce |
| Checklist | C3 |

### M3 — Tenancy Ready (WP-03)

| Criterion | Outcome |
| --- | --- |
| Orgs / locations / memberships / invitations | Facade complete with in-memory persistence |
| Invitation email bind | Mismatch denied (`InvitationEmailMismatchError`) — C8 |
| Org create | Owner membership + `tenancy.organization.created` outbox |
| Dependencies | Identity facade only |
| Checklist | C4, C8 |

### M4 — Authorization Ready (WP-04)

| Criterion | Outcome |
| --- | --- |
| Catalog permissions | Core seeds ⊆ permission catalog |
| Default deny | `authorize` fails closed without assignment |
| Org admin bootstrap | `organization.administrator` via composer (no Tenancy→RBAC cycle; no owner bypass) |
| Location authz | Assignment `locationId` ≠ membership home location |
| Checklist | C5, C7 |

### M5 — Audit Ready (WP-05)

| Criterion | Outcome |
| --- | --- |
| Append-only SoR | Corrections = new rows |
| SECURITY projection | Identity / Tenancy / RBAC via outbox relay → Audit |
| Idempotency | `eventId` / `sourceEventId` — re-delivery safe |
| FINANCIAL | Metadata-only ingest (ADR-0005); Audit ≠ books |
| DAG | Producers ↛ Audit |
| Checklist | C6; C9 complete |

### M6 — Kernel Complete (WP-06)

| Criterion | Outcome |
| --- | --- |
| Boundary / DAG gates | Illegal edges fail `pnpm enforce:architecture` |
| Event / permission catalog gates | Unknown Core declarations fail CI |
| Outbox / architecture suites | SECURITY path tests + static O-01/O-04/O-05 |
| Documentation / ADR / exceptions | DOC-01, A-01/A-02, C-06 |
| CI | `governance` job blocking (E2–E4) |
| Checklist | E1–E7 (Core scope) |

---

## 3. Delivered Capabilities

| Capability | Package | Notes |
| --- | --- | --- |
| Transactional outbox | `@nbcp/outbox` | UoW, writer, relay, archive seam, idempotency, replay |
| Identity | `@nbcp/identity` | Facade; SECURITY events; no org ownership of principals |
| Tenancy | `@nbcp/tenancy` | Org/location/membership/invitation; Identity facade only |
| RBAC | `@nbcp/rbac` | Roles, assignments, catalog seed, `authorize`, org-admin bootstrap |
| Audit | `@nbcp/audit` | Append-only trail; event projector; query; retention archive/purge hooks |
| Kernel vertical slice | Integration + [kernel-demo.md](../runbooks/kernel-demo.md) | Register → org → admin authorize → audit row |

**Persistence posture:** In-memory repositories and composition kernels for tests/early hosts. NestJS + Prisma hosts remain deferred (ADR-0001 stack commitment stands; not blocking Shared domain logic).

**Dependency DAG (enforced):**

```text
Identity (no module deps)
    ↑
Tenancy
    ↑
RBAC
    ↑
Audit  ←── consumes events (does not reverse-import producers)
```

Infra: all Core publishers → `@nbcp/outbox`.

---

## 4. Delivered Governance

| Artifact | Role |
| --- | --- |
| ADR-0001…0006 | Accepted platform doctrine (tech foundation, domain map, outbox, retention/replay, financial truth, enforcement) |
| [Event catalog](../reference/event-catalog.md) | Canonical types; Core Identity/Tenancy/RBAC/Audit rows **Published** |
| [Permission catalog](../reference/permission-catalog.md) | Canonical keys; Core seeds aligned with `@nbcp/rbac` |
| Module designs | `docs/modules/{identity,tenancy,rbac,audit}/design.md` |
| Runbooks | Event replay · tenant rebuild · reporting rebuild · [kernel demo](../runbooks/kernel-demo.md) |
| [Exceptions register](../adr/exceptions/README.md) | Empty Active set; expired Active rows fail CI |
| Bootstrap / execution / backlog | Checklist C/E green; WP DoD marked complete |

---

## 5. Delivered Automation

| Gate | Mechanism |
| --- | --- |
| E1 Foundation | CI `foundation` file/directory presence |
| E2 Boundaries | `@nbcp/architecture-enforcement` (B-01…B-06, D-01…D-02) |
| E3 Outbox architecture | Module `architecture.test.ts` + enforcer O-01; outbox O-03/O-04 suite |
| E4 Event catalog | Enforcer E-01…E-05 on Core `*EventTypes` |
| E5 Permissions | Enforcer P-01…P-03 (Core seeds + consts) |
| E6 Module docs | DOC-01 (design.md, README, CHANGELOG) |
| E7 Exceptions | C-06 expiry check |
| CLI | `pnpm enforce:architecture` |
| CI job | `governance` (needs Audit; blocking) |

Automation backlog **W0–W2** done; Core subset of **W3** done. Remaining wave items (Shared FINANCIAL outbox O-02, D-04, E-04, A-04, broader C-05) are deferred to Shared/multi-team eras — documented in [architecture-automation-backlog.md](../implementation/architecture-automation-backlog.md).

---

## 6. Architectural Validation

| Concern | Validation |
| --- | --- |
| Identity independence | Package + import graph; enforcer B-03 |
| Identity / Tenancy / RBAC ↛ Audit | Architecture tests + enforcer B-04 / D-01 |
| Facade-only cross-module access | No deep `@nbcp/*/src|infrastructure|…` imports (B-05) |
| Domain purity | Domain layer bans Nest/Prisma/infra imports (B-06) |
| Payments ↛ Ledger | Forbidden edge D-02 (ready before Payments exists) |
| SECURITY → outbox | Same-UoW publish in Identity/Tenancy/RBAC + tests |
| Audit not SoR for business/money | Event projection; FINANCIAL metadata-only |
| Catalog alignment | Emitted Core event types and permission seeds ⊆ catalogs |
| No wipe-rebuild of Audit | Retention archive/purge dual-control; ADR-0004 posture |

Kernel hard-gate criteria from the backlog are **met**:

1. M6 Kernel Complete  
2. Kernel demo path verified (docs + tests)  
3. No unboundaried exceptions on Identity independence or *↛ Audit  
4. Event + permission catalogs updated for shipped Core surface  
5. ADR-0001…0006 remain Accepted  

---

## 7. Deferred Items

Explicitly **out of scope** for the completed kernel; do not treat as incomplete M6:

| Item | Deferred until |
| --- | --- |
| NestJS hosts / Prisma persistence for Core modules | Shared/app scaffolding wave |
| `tenancy.invitation.expired` worker | Ops worker (event remains Planned) |
| Shared modules (Parties, Catalog, Orders, Payments, Ledger, Inventory, Reporting, …) | Post-M6 Shared WPs |
| FINANCIAL outbox architecture suite (O-02) | When Payments/Ledger land |
| Product modules / product event annexes | After Shared spine |
| RBAC resource-level ABAC | Not in design for v1 |
| Full Reporting rebuild tooling (A-04) | Reporting implementation |
| Real message broker | Infra choice; in-process dispatcher sufficient for kernel |
| Production dual-control workflows beyond purge flags | Ops/security hardening |

---

## 8. Known Limitations

1. **In-memory stores** — not production durability; hosts must replace repositories without changing facades.  
2. **Composition roots** — `create*Kernel` helpers are for tests/early hosts; Nest composition is pending.  
3. **Org admin bootstrap** — application/composer must call RBAC after org create (by design; avoids Tenancy↔RBAC cycle).  
4. **`audit.record.appended`** — implemented but off by default (volume); retention events emit on archive/purge.  
5. **Session.issued** — high volume; catalog Conditional replay; Audit still may project (policy can sample later).  
6. **Node engines** — packages declare `>=22`; local Node 18 runs with warnings only.  
7. **Permission/event scan depth** — enforcer focuses on Core declaration files; broaden when Shared packs ship.  
8. **HTTP / OpenAPI surfaces** — not delivered; facades are the contract for now.

---

## 9. Readiness for Shared Domains

| Gate | State |
| --- | --- |
| Hard gate (M6 + catalogs + ADRs + no kernel exceptions) | **PASS** |
| Parties start | **Allowed** (hard gate only) |
| Catalog start | **Allowed** when Parties facade needed by design — Parties first if refs required |
| Orders start | **Allowed** after Parties + Catalog facades for commercial refs |
| Payments / Ledger | **Not** opened by this report — require S4/S5 discipline + ADR-0005 (Payments ↛ Ledger writes) |
| Product verticals | **Not** opened — P1–P4 after Shared spine |

**Rules for Shared implementers:**

* Depend Product → Shared → Core only; never Shared → Product.  
* Extend event and permission catalogs in the **same PR** as first emit/seed.  
* SECURITY/FINANCIAL/material BUSINESS events use transactional outbox.  
* Call Core `authorize` / Audit projection patterns; do not import Audit from producers that must stay Audit-free.  
* Run `pnpm enforce:architecture` locally; expect `governance` CI to fail illegal DAG or unknown catalog types.

---

## 10. Recommendation

### Proceed to Shared Domains

The Core Kernel is delivery-complete for its charter: durable SECURITY events, independent Identity, Tenancy with invitation policy, deny-by-default RBAC with org-admin bootstrap, append-only Audit projection, and blocking ADR-0006 automation.

**Authorize start of Shared Domain work** beginning with **Parties**, then **Catalog**, then **Orders**, under existing ADR and catalog governance. Do not start Payments/Ledger until Orders payable shape is clear and ADR-0005 boundaries are encoded in the same enforcement discipline already used for the kernel.

| Sign-off | Role | Date | Decision |
| --- | --- | --- | --- |
| Lead Architect | Architecture | 2026-07-14 | **Proceed to Shared Domains** |
| Delivery lead | Program | _pending_ | Confirm Shared epic open |
| Platform owners | CODEOWNERS | _via PR merge_ | M6 gates on main |

---

## Document control

| Version | Date | Notes |
| --- | --- | --- |
| 1.0 | 2026-07-14 | Initial kernel completion report — M1…M6 achieved; recommend Shared start |
