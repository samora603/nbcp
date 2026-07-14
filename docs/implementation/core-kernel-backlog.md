# Core Kernel Implementation Backlog

**Status:** Executable work-package backlog (documentation only)  
**Owner:** Lead Architect / Technical Delivery Lead  
**Plan authority:** [core-platform-execution-plan.md](core-platform-execution-plan.md) · [core-bootstrap-plan.md](core-bootstrap-plan.md) · [bootstrap-checklist.md](bootstrap-checklist.md)  
**Policy:** ADR-0001…0006 · [event catalog](../reference/event-catalog.md) · [permission catalog](../reference/permission-catalog.md)  
**Last updated:** 2026-07-14  

Converts Core platform planning into **delivery work packages (WP)** for sprint/epic tracking. This document does **not** contain code, schemas, or API contracts.

**ID mapping:** WP-01…06 ↔ Execution Plan Phases 1…6 ↔ Checklist C1–C9 / E2–E4.

---

## Executive Summary

### Goal of the Core Kernel

Deliver a **working, enforceable Core** that:

1. Publishes SECURITY domain events through a **transactional outbox**  
2. Manages **principals** (Identity) independent of tenancy  
3. Manages **organizations / memberships / invitations** (Tenancy)  
4. Enforces **authorization** (RBAC) with org-admin bootstrap and default deny  
5. Projects an **append-only audit trail** without breaking the kernel DAG  
6. **Fails CI** on boundary and outbox regressions before Shared modules start  

Kernel demo path: *register/authenticate → create organization → owner becomes `organization.administrator` → privileged action is audited*.

### Expected implementation sequence

```text
WP-01 Outbox Foundation
  → WP-02 Identity
  → WP-03 Tenancy
  → WP-04 RBAC
  → WP-05 Audit
  → WP-06 Architecture Enforcement (blocking harden)
```

WP-06 **scaffolding** (CI file checks, empty boundary config) may start in parallel with WP-01. WP-06 **must be blocking** before Parties.

### Critical path

```text
Outbox atomicity  →  Identity SECURITY emit  →  Org create event
  →  Admin role bootstrap  →  Audit consume  →  CI gates green
```

Anything that skips outbox before Identity SECURITY commits, or grants admin inside Tenancy without RBAC, is **critical-path waste** (rework). Shared (Parties/Catalog/Orders) is **off** the critical path until M6.

---

## Work Package 01 — Outbox Foundation

**Epic / track:** Kernel infrastructure  
**Checklist:** C1, C2  
**Implementation package:** [wp-01-outbox-implementation-package.md](wp-01-outbox-implementation-package.md)  
**ADR:** 0003, 0004, 0006 (outbox clauses)

### Scope

* Unit-of-work boundary spanning aggregate persistence + outbox append  
* Outbox writer, envelope validation, relay with retry/poison handling  
* Test harness for “mutation ⇒ outbox in same UoW”  
* Optional archive stub toward ADR-0004 (tracked if not full)  

**Out of scope:** Domain event semantics; Audit/Ledger consumers; broker product selection.

### Deliverables

| # | Deliverable |
| --- | --- |
| D1 | Outbox append capability usable by Core modules |
| D2 | Envelope validation rejecting incomplete envelopes |
| D3 | Relay that publishes unpublished rows at-least-once |
| D4 | Architecture-test helper/fixtures for later WPs |
| D5 | Package/docs linking ADR-0003/0004 |

### Dependencies

| Requires | Unblocks |
| --- | --- |
| Database technical access (platform package) | WP-02…05 event publishing |
| None of Identity/Tenancy/RBAC/Audit | — |

### Acceptance Criteria

* Commit persists mutation evidence + outbox together; rollback removes both.  
* Incomplete envelopes rejected.  
* Relay retries; poison path documented and observable.  
* Helper exists for SECURITY outbox assertions (WP-02).  

### Risks

| Risk | Mitigation |
| --- | --- |
| Building full broker early | Stay worker/in-process per ADR-0001 |
| Shipping Identity without outbox | Gate WP-02 merge on D1–D3 |
| Ignoring archive | Stub + backlog item before money path |

### Definition of Done

* [ ] D1–D5 complete  
* [ ] C1–C2 satisfiable  
* [ ] Non-prod relay smoke succeeded  
* [ ] No domain-module dependency introduced  

---

## Work Package 02 — Identity

**Checklist:** C3, C9 (partial)  
**Design:** [identity/design.md](../modules/identity/design.md)

### Scope

* Principal lifecycle, credentials/lockout, sessions, password reset  
* External identity link/unlink as designed  
* Platform-operator permissions for support admin  
* SECURITY events via outbox  
* **Zero** `modules/*` dependencies  

**Out of scope:** Roles, organizations, Audit imports, Notifications module (mail **port** only).

### Deliverables

| # | Deliverable |
| --- | --- |
| D1 | Identity module with public facade only |
| D2 | Outbox-backed SECURITY emissions for implemented flows |
| D3 | Self-service authn paths (register/login/reset) without RBAC |
| D4 | Architecture test: Identity ↛ other modules |
| D5 | Event catalog Status updates for first-emitted types |

### Dependencies

| Requires | Unblocks |
| --- | --- |
| WP-01 | WP-03 (principal ids) |

### Events

Minimum for kernel path (all SECURITY, outbox-mandatory) — full list in [event catalog](../reference/event-catalog.md):

* `identity.user.registered`, `email_verified`, `activated`, `suspended`, `deactivated`  
* `identity.session.issued`, `session.revoked`  
* `identity.password_reset.requested`, `password_reset.completed`  
* Additional catalog Identity rows as features land  

### Permissions

* `identity.user.read`, `identity.user.manage`, `identity.session.revoke`, `identity.external_identity.manage` → `platform.operator`  
* Self-service: no RBAC grant  

### Acceptance Criteria

* Facade-only consumption by peers.  
* SECURITY mutations write outbox in same UoW (architecture test).  
* No Tenancy/RBAC/Audit package imports.  
* Emitted `type`s ⊆ event catalog.  

### Definition of Done

* [ ] Deliverables D1–D5  
* [ ] C3 green; C9 Identity isolation + at least one outbox assertion  
* [ ] Milestone **M2** criteria met  

---

## Work Package 03 — Tenancy

**Checklist:** C4, C8  
**Design:** [tenancy/design.md](../modules/tenancy/design.md) · [tenant-access-model.md](../architecture/tenant-access-model.md) · [invitation-acceptance-policy.md](../architecture/invitation-acceptance-policy.md)

### Scope

* Organizations, locations, memberships, invitations, owner transfer  
* Invitation email-bind / accept rules  
* Emit SECURITY events; **no** privilege grants inside Tenancy  
* Depend on Identity facade only (+ outbox)  

**Out of scope:** RBAC evaluation, Audit imports, Shared modules.

### Deliverables

| # | Deliverable |
| --- | --- |
| D1 | Tenancy module facade for org/location/membership/invitation |
| D2 | Outbox emissions for implemented Tenancy catalog types |
| D3 | Invitation accept mismatch **denied** |
| D4 | `tenancy.organization.created` carrying owner principal correlation for bootstrap |
| D5 | Architecture test: Tenancy ↛ Audit, ↛ RBAC |

### Dependencies

| Requires | Unblocks |
| --- | --- |
| WP-02 Identity facade | WP-04 bootstrap consumer |
| WP-01 | — |

### Events

Catalog Tenancy section; minimum:

* `tenancy.organization.created` (+ lifecycle as implemented)  
* `tenancy.membership.created` / `activated` / `removed` as implemented  
* `tenancy.invitation.created` / `accepted` / `revoked` / …  
* Location events as implemented  

### Permissions

Keys owned by Tenancy (enforcement hardens in WP-04):

* `tenancy.organization.read|manage`  
* `tenancy.location.read|manage`  
* `tenancy.membership.read|manage`  
* `tenancy.invitation.manage`  
* `tenancy.organization.transfer_owner`  

### Acceptance Criteria

* No owner-bypass / “isOwner ⇒ allow all” inside Tenancy.  
* Invitation policy enforced.  
* Tenant-scoped writes carry `organizationId` per design.  
* Events outbox-mandatory.  

### Definition of Done

* [ ] D1–D5  
* [ ] C4, C8 green  
* [ ] Milestone **M3** criteria met  

---

## Work Package 04 — RBAC

**Checklist:** C5, C7  
**Design:** [rbac/design.md](../modules/rbac/design.md) · [permission catalog](../reference/permission-catalog.md)

### Scope

* Permission registry seeded from permission catalog (Core keys)  
* Roles, bindings, assignments (`locationId` = authz scope)  
* Default-deny `authorize`  
* Org admin bootstrap on org-create path (composer or RBAC handler — **not** Tenancy→RBAC cycle)  
* RBAC SECURITY events via outbox  

**Out of scope:** Audit imports; Shared permission packs beyond Core seeds (may stub register API).

### Deliverables

| # | Deliverable |
| --- | --- |
| D1 | Permission seed ⊆ permission catalog |
| D2 | Role + assignment management |
| D3 | `authorize` default deny + positive grant tests |
| D4 | Bootstrap: org owner receives `organization.administrator` |
| D5 | Outbox events for permission/role/assignment changes |

### Dependencies

| Requires | Unblocks |
| --- | --- |
| WP-02, WP-03 | WP-05 (assignment/role events); protected Tenancy/RBAC admin routes |
| WP-01 | — |

### Events

* `rbac.permission.registered` / `deprecated`  
* `rbac.role.created` / `updated` / `deleted`  
* `rbac.role_assignment.granted` / `revoked` / `scope_changed`  

### Permissions

* `rbac.permission.read`, `rbac.role.read|manage`, `rbac.assignment.read|manage`  
* Bootstrap exception: first admin assign without prior `rbac.assignment.manage`  

### Acceptance Criteria

* Membership location ≠ authorization; assignment `locationId` does.  
* Post-bootstrap assignments require `rbac.assignment.manage`.  
* No Audit import.  
* C7 proven by integration test.  

### Definition of Done

* [ ] D1–D5  
* [ ] C5, C7 green  
* [ ] Milestone **M4** criteria met  

---

## Work Package 05 — Audit

**Checklist:** C6, C9 (complete)  
**Design:** [audit/design.md](../modules/audit/design.md) · ADR-0004 SECURITY retention

### Scope

* Append-only audit records  
* Idempotent consumers of Identity/Tenancy/RBAC SECURITY events  
* Query path; host enforces `audit.read`  
* Retention/archive posture per design (no wipe-rebuild)  

**Out of scope:** Reporting rebuild; FINANCIAL projectors; Identity/Tenancy/RBAC calling Audit as substitute for outbox.

### Deliverables

| # | Deliverable |
| --- | --- |
| D1 | Audit append store + consumer workers/handlers |
| D2 | Idempotency on `eventId` |
| D3 | Kernel SECURITY checklist coverage for implemented events |
| D4 | Architecture tests: Identity/Tenancy/RBAC ↛ Audit |
| D5 | Readable audit for org admin / auditor permission |

### Dependencies

| Requires | Unblocks |
| --- | --- |
| WP-01 relay; WP-02…04 events flowing | Kernel demo complete; M5/M6 |
| May depend on Identity/Tenancy facades for enrichment if designed | — |

### Events

**Consumes:** Identity, Tenancy, RBAC SECURITY types (catalog).  
**May publish:** `audit.record.appended` (sampled/off), `audit.retention.*` (ops).

### Permissions

* `audit.read` — investigator/admin  
* `audit.retention.manage` — platform operator (+ dual-control on purge)  

### Acceptance Criteria

* Re-delivery does not duplicate logical audit effect.  
* Append-only; corrections = new rows.  
* Producers of kernel SECURITY remain Audit-free packages.  

### Definition of Done

* [ ] D1–D5  
* [ ] C6 green; C9 complete  
* [ ] Milestone **M5** criteria met  

---

## Work Package 06 — Architecture Enforcement

**Checklist:** E2–E4 (E1 already foundation)  
**Policy:** [ADR-0006](../adr/0006-architecture-enforcement-and-governance.md) · [architecture-automation-backlog.md](architecture-automation-backlog.md)

### Scope

* Boundary / dependency graph validation for Core packages  
* SECURITY outbox architecture tests required on CI  
* Event catalog allow-list validation for Core publishers  
* Progressive permission catalog checks  
* Exception process only if needed (time-boxed)  

**Out of scope:** Selecting a specific lint product; Shared FINANCIAL outbox tests (later O-02); product annex catalogs.

### Deliverables

| # | Deliverable |
| --- | --- |
| D1 | CI job failing illegal Core edges (Identity isolation, *↛ Audit, no deep imports) |
| D2 | Required architecture test suite on default branch |
| D3 | Event catalog validation for emitted Core types |
| D4 | Documented status of automation backlog W1–W2 items |
| D5 | No open unboundaried kernel exceptions |

### Dependencies

| Requires | Unblocks |
| --- | --- |
| Packages from WP-01…05 exist to analyze | **Parties / Catalog / Orders** start |
| May scaffold config from WP-01 day one | — |

### Events / Permissions

N/A (meta). Ensures catalogs remain source of truth.

### Acceptance Criteria

* Merge to main cannot introduce Identity→Tenancy or Tenancy→Audit imports.  
* SECURITY path without outbox fails tests.  
* Unknown event `type` publish fails CI (or warn with flip date ≤ Shared start).  

### Definition of Done

* [ ] D1–D5  
* [ ] E2–E4 blocking (or dated warn→fail ≤ Shared kickoff)  
* [ ] Milestone **M6** criteria met  

---

## Dependency Graph

```text
WP-01 Outbox
   │
   ▼
WP-02 Identity
   │
   ▼
WP-03 Tenancy
   │
   ▼
WP-04 RBAC
   │
   ▼
WP-05 Audit
   │
   ▼
WP-06 Enforcement (blocking)
```

### Why this order

| Edge | Reason |
| --- | --- |
| Outbox → Identity | SECURITY events must be durable before Identity is “done” |
| Identity → Tenancy | Memberships/invites reference principals; Identity must stay free of Tenancy |
| Tenancy → RBAC | Org create event drives admin bootstrap; RBAC needs org + principal ids |
| RBAC → Audit | Audit consumes RBAC assignment events; RBAC must not import Audit |
| Audit → Enforcement | Prove the full slice, then lock the DAG in CI before Shared multiplies surface area |
| Parallel WP-06 scaffold | Early signal; cannot replace the chain above |

**Forbidden reverse edges:** Tenancy/RBAC/Identity → Audit; Identity → Tenancy/RBAC; skipping Outbox for SECURITY.

---

## Testing Strategy

| Work package | Unit | Integration | Architecture validation |
| --- | --- | --- | --- |
| **WP-01** | Envelope validation matrix; retry classification | Commit/rollback outbox coupling; relay smoke | Helper readiness for O-01 style tests |
| **WP-02** | Domain invariants (lockout, password rules as designed) | Register/login/session + outbox row present | Identity ↛ `modules/*`; SECURITY ⇒ outbox |
| **WP-03** | Invitation accept policy cases | Org create + membership + invite flows + outbox | Tenancy ↛ Audit/RBAC; `organizationId` presence checks |
| **WP-04** | Authorize allow/deny matrix; location scope | Bootstrap admin on org create; assignment manage gates | RBAC ↛ Audit; permission keys ⊆ catalog |
| **WP-05** | Record immutability guards (as designed) | Event → audit append; duplicate `eventId` | Identity/Tenancy/RBAC ↛ Audit; O-05 idempotency |
| **WP-06** | Allow-list parsers (if any) | CI job green/red fixtures | Boundary graph; catalog gate; outbox suite required check |

**Kernel E2E (spans WP-02…05):** principal → org → admin authorize → audit row for a SECURITY action.

---

## Milestones

### M1 Kernel Foundation

**Maps to:** WP-01 complete  

| Criterion | Objective signal |
| --- | --- |
| Outbox atomic | Integration test pass |
| Envelope validation | Rejection tests pass |
| Relay | Non-prod publish smoke |
| Checklist | C1–C2 |

### M2 Identity Ready

**Maps to:** WP-02 complete  

| Criterion | Objective signal |
| --- | --- |
| Facade live | Module consumed only via public API |
| SECURITY outbox | Architecture test green |
| Isolation | Identity import graph clean |
| Checklist | C3 |

### M3 Tenancy Ready

**Maps to:** WP-03 complete  

| Criterion | Objective signal |
| --- | --- |
| Org + invite flows | Integration tests green |
| Invitation policy | Mismatch denied |
| Org-created event | Observable for bootstrap |
| Checklist | C4, C8 |

### M4 Authorization Ready

**Maps to:** WP-04 complete  

| Criterion | Objective signal |
| --- | --- |
| Default deny | Authorize tests |
| Admin bootstrap | Owner has `organization.administrator` without bypass flag |
| Seeds | ⊆ permission catalog |
| Checklist | C5, C7 |

### M5 Audit Ready

**Maps to:** WP-05 complete  

| Criterion | Objective signal |
| --- | --- |
| Projection | Kernel SECURITY events → audit |
| Idempotency | Duplicate eventId safe |
| DAG | Producers ↛ Audit |
| Checklist | C6; C9 complete |

### M6 Kernel Complete

**Maps to:** WP-06 complete + M1–M5  

| Criterion | Objective signal |
| --- | --- |
| Demo path | Documented non-prod walkthrough succeeded |
| CI | E2–E4 blocking |
| Checklist | C1–C9 all green |
| Catalogs | Emitted Core types Published; seeds aligned |
| Gate | Delivery lead signs Shared start |

---

## Exit Criteria — Before Parties / Catalog / Orders

### Hard gate (all three Shared starts)

Must be true before **any** of Parties, Catalog, or Orders implementation begins:

1. **M6 Kernel Complete** (C1–C9 + blocking enforcement).  
2. Kernel demo path verified.  
3. No open unboundaried exceptions on Identity independence or *↛ Audit.  
4. Event + permission catalogs updated for shipped Core surface.  
5. ADR-0001…0006 remain Accepted.

### Module-specific (after hard gate)

| Module | Also required |
| --- | --- |
| **Parties** | Hard gate only |
| **Catalog** | Parties facade available if item ownership/party refs required by design |
| **Orders** | Parties + Catalog facades available for commercial references; Core authorize path reusable |

**Not required** for Parties start: Payments, Ledger, Reporting, Inventory fulfillment policy, product verticals.

---

## Tracking notes

| Practice | Guidance |
| --- | --- |
| One WP ≈ one epic | Sub-tasks per Deliverable D# |
| Do not skip WP-01 | Critical path |
| Catalog PR with emit PR | ADR-0006 same-PR rule |
| Enforcement early | Scaffold WP-06 week 1; harden at M6 |
| Shared parking lot | Refuse Parties PR review until M6 signed |

---

## Traceability

| Backlog | Plan / checklist |
| --- | --- |
| WP-01 | Execution Phase 1; C1–C2 |
| WP-02 | Phase 2; C3 |
| WP-03 | Phase 3; C4, C8 |
| WP-04 | Phase 4; C5, C7 |
| WP-05 | Phase 5; C6, C9 |
| WP-06 | Phase 6; E2–E4; automation W1–W2 |
| M1–M6 | Program DoD in execution plan |

---

## Document control

| Version | Date | Notes |
| --- | --- | --- |
| 1.0 | 2026-07-14 | Initial Core kernel backlog |
