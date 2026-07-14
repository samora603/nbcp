# Core Platform Execution Plan

**Status:** Normative implementation sequencing (documentation only)  
**Audience:** Engineering leads executing Phase 1 Core scaffolding  
**Readiness:** 8.5/10 — Ready for implementation ([reassessment](../reviews/architecture-readiness-reassessment.md))  
**Depends on:** [core-bootstrap-plan.md](core-bootstrap-plan.md), [bootstrap-checklist.md](bootstrap-checklist.md), [core-kernel-backlog.md](core-kernel-backlog.md), [architecture-automation-backlog.md](architecture-automation-backlog.md), ADR-0001…0006, [event catalog](../reference/event-catalog.md), [permission catalog](../reference/permission-catalog.md)  
**Last updated:** 2026-07-14  

This plan details **how** to execute Core foundation work. It does **not** specify frameworks, database schemas, or HTTP API contracts — those belong in module designs and later implementation PRs. Module designs under `docs/modules/{identity,tenancy,rbac,audit}/` remain the narrative authority for domain behavior.

---

## Executive Summary

### Scope

**In scope**

* Outbox and eventing foundation (platform technical capability)  
* Core modules: **Identity → Tenancy → RBAC → Audit**  
* Architecture enforcement gates for the kernel DAG (ADR-0006 Wave W0–W2)  
* Kernel vertical slice: register/authenticate → create org → bootstrap admin → audited SECURITY trail  

**Out of scope (explicit)**

* Parties, Catalog, Orders, Payments, Ledger, Inventory, Reporting, Notifications, Scheduling  
* Product verticals  
* Choosing concrete ORMs, queues, or CI lint vendors  
* Publishing Shared FINANCIAL events beyond what Audit may later consume  
* Production Reporting rebuild drills (runbooks exist; Reporting module not in this plan)

### Objectives

1. Establish a **reliable publish path** so SECURITY events survive crashes (ADR-0003/0004/0006).  
2. Deliver an **acyclic Core kernel** with Identity independence and no Identity/Tenancy/RBAC → Audit imports.  
3. Prove **org admin bootstrap without owner bypass** ([tenant-access-model.md](../architecture/tenant-access-model.md)).  
4. Prove **invitation acceptance** email-bind rules.  
5. Land **minimum enforceable CI** so Shared coding cannot silently invert the DAG.  
6. Keep catalogs authoritative: every emitted Core `type` and authorize key is registered.

### Success criteria (program level)

| Criterion | Signal |
| --- | --- |
| Checklist C1–C9 complete | [bootstrap-checklist.md](bootstrap-checklist.md) Core section green |
| Architecture tests for outbox + isolation | Tagged suite required on default branch |
| Demo path works end-to-end (non-prod) | Principal → org → admin authorize → audit readable |
| No Shared modules started early | Parties+ gated by exit criteria below |
| Event/permission catalogs updated when Core types go live | Status Planned → Published for emitted rows |

---

## Phase dependency graph

```text
                    ┌─────────────────────┐
                    │ Phase 1: Outbox /   │
                    │ Eventing Foundation │
                    └──────────┬──────────┘
                               │
                    ┌──────────▼──────────┐
                    │ Phase 2: Identity   │
                    └──────────┬──────────┘
                               │
                    ┌──────────▼──────────┐
                    │ Phase 3: Tenancy    │
                    └──────────┬──────────┘
                               │
                    ┌──────────▼──────────┐
                    │ Phase 4: RBAC       │◄── permission catalog seeds
                    └──────────┬──────────┘
                               │
                    ┌──────────▼──────────┐
                    │ Phase 5: Audit      │◄── consumes 2–4 events
                    └──────────┬──────────┘
                               │
                    ┌──────────▼──────────┐
                    │ Phase 6: Enforcement│ (skeletons from Phase 1;
                    │ (CI harden)         │  must be blocking before Shared)
                    └─────────────────────┘
```

**Parallelism allowed:** Phase 6 Wave W0 file checks and boundary-config scaffolding may start alongside Phase 1. **Forbidden:** Tenancy before Identity facade; RBAC before Tenancy org create; Audit producers inside Identity/Tenancy/RBAC packages; Shared commerce before Phase 6 blocking gates for kernel edges.

---

## Phase 1 — Outbox and Eventing Foundation

### Responsibilities

| Component | Owns |
| --- | --- |
| Unit of work | Atomic boundary spanning aggregate persistence + outbox append |
| Outbox writer | Durable pending publications with envelope payload |
| Envelope validator | Reject incomplete envelopes before persistence |
| Relay | After-commit publication attempt; retry; poison handling |
| Archive hook (min) | Path toward ADR-0004 hot/cold retention (may be stub that logs/copies for Core) |
| Test harness | Helpers asserting “mutation ⇒ outbox row in same UoW” for later phases |

Does **not** own domain event semantics — producers own `type` and payload contracts.

### Required interfaces (capability level)

Describe ports, not signatures:

1. **Begin/commit/rollback unit of work** used by application services.  
2. **Append domain event envelope to outbox** inside an open unit of work.  
3. **Validate envelope** required fields per ADR-0003 (`eventId`, `type`, `version`, `occurredAt`, `producer`, `organizationId` when applicable, `payload`, correlation ids as designed).  
4. **List unpublished / mark published / mark failed** for relay.  
5. **Dispatch published events** to in-process or worker consumers (broker deferred per ADR-0001).  

### Event publishing flow

```text
1. Application use case opens Unit of Work
2. Aggregate mutation staged
3. Domain events collected → envelopes built (producer module owns type/payload)
4. OutboxWriter.append(envelope) in same UoW
5. Commit UoW  → aggregate + outbox durable together
   Rollback    → neither visible
6. Relay reads unpublished rows (at-least-once)
7. Dispatch to consumers (Audit handlers, etc.)
8. Consumers apply idempotently on eventId (ADR-0003/0004)
9. Optional: archive copy at publish success (ADR-0004)
```

**Prohibited patterns:** publish-only after commit without outbox row for SECURITY classes; fire-and-forget as sole durability; incomplete envelopes; unregistered `type` strings.

### Acceptance criteria

* Same UoW commit persists mutation evidence and outbox row; rollback leaves neither.  
* Validator rejects incomplete envelopes.  
* Relay retries transient failures; poison path is documented and observable.  
* Architecture test helper exists for Phase 2 SECURITY cases (checklist C1–C2).  

### Testing expectations

| Layer | Expectation |
| --- | --- |
| Unit | Envelope validation matrix |
| Integration | Commit/rollback outbox coupling |
| Architecture | Tagged test proving outbox present on successful SECURITY path (landed with Phase 2) |
| Chaos (light) | Kill mid-relay → row remains unpublished or retries safely |

### Phase 1 Definition of Done

* [ ] Outbox append + relay runnable in non-prod  
* [ ] Envelope validation enforced  
* [ ] Docs/README for the technical package link ADR-0003/0004  
* [ ] C1–C2 satisfiable  

### Phase 1 risks

| Risk | Mitigation |
| --- | --- |
| Relaying before Identity exists | Use fixture publishers in tests; do not block Identity skeleton |
| Over-building broker | Stay in-process/worker per ADR-0001 |
| Skipping archive | Accept stub only if hot retention path is tracked as follow-up before money path |

---

## Phase 2 — Identity

### Capabilities

* Principal lifecycle: register, verify, activate/suspend/deactivate, soft-delete  
* Credential and lockout behaviors per [identity/design.md](../modules/identity/design.md)  
* Session issue/revoke  
* Password change and password-reset challenge flows  
* External identity link/unlink (as designed)  
* Support/admin operations gated by Identity permissions (platform operator)  
* **Zero** dependencies on other domain modules  

### Events

Publish all Identity rows in the [event catalog](../reference/event-catalog.md) that this slice implements (minimum for bootstrap demo):

* `identity.user.registered`, `email_verified`, `activated`, `suspended`, `deactivated`  
* `identity.session.issued`, `identity.session.revoked`  
* `identity.password_reset.requested`, `identity.password_reset.completed`  
* `identity.user.password_changed`, `locked_out`, `unlock` as reached  

All are **SECURITY**, **outbox-mandatory**, Replayable per catalog.

### Permissions

From [permission-catalog.md](../reference/permission-catalog.md):

* `identity.user.read`, `identity.user.manage`, `identity.session.revoke`, `identity.external_identity.manage` — platform operator  
* Self-service register/login/reset remain **non-RBAC**  

### Dependencies

| Depends on | Must not depend on |
| --- | --- |
| Phase 1 outbox / envelopes | Tenancy, RBAC, Audit, any Shared/Product module |
| Clock, id, hasher, mail **ports** (adapters later) | Notifications **module** import (port only) |

### Acceptance criteria

* Public facade only; no deep imports into Identity from peers  
* SECURITY mutations write outbox in same UoW  
* Architecture test: Identity package has zero `modules/*` imports  
* Catalog types used are registered; mark Published when first emitted  

### Phase 2 Definition of Done

* [ ] C3 green  
* [ ] Outbox architecture assertion for at least one register/suspend path (C9 partial)  
* [ ] Design non-goals honored (no roles/tenancy inside Identity)  

### Phase 2 risks

| Risk | Mitigation |
| --- | --- |
| Pulling Tenancy “just for org” | Reject; principal is global |
| Sync email send in TX | Port + async via later Notifications / worker on event |
| Sampling session.issued floods | Follow catalog Conditional replay / Audit sample policy |

---

## Phase 3 — Tenancy

### Capabilities

* Organization create/activate/suspend/archive (as designed)  
* Locations create/update/deactivate  
* Memberships create/activate/suspend/remove/leave  
* Invitations create/accept/decline/revoke/expire  
* Owner transfer  
* Enforce [invitation-acceptance-policy.md](../architecture/invitation-acceptance-policy.md)  
* Align with [tenant-access-model.md](../architecture/tenant-access-model.md) (membership ≠ authorization)  

### Events

Catalog Tenancy section — SECURITY, outbox-mandatory. Minimum for kernel demo:

* `tenancy.organization.created` (with owner principal correlation)  
* `tenancy.membership.created` / `activated`  
* `tenancy.invitation.created` / `accepted` / `revoked`  
* Location and remaining membership events as implemented  

### Permissions

Seed and enforce:

* `tenancy.organization.read|manage`  
* `tenancy.location.read|manage`  
* `tenancy.membership.read|manage`  
* `tenancy.invitation.manage`  
* `tenancy.organization.transfer_owner`  

*(Authorization calls land fully in Phase 4; Phase 3 must not invent owner-bypass flags.)*

### Dependencies

| Depends on | Must not depend on |
| --- | --- |
| Identity facade (principal ids) | RBAC, Audit |
| Phase 1 outbox | Shared/Product |

### Acceptance criteria

* Tenant-scoped data carries `organizationId` where required by design  
* Invitation accept denies email mismatch  
* Org create does **not** grant privileges inside Tenancy itself — emits events for RBAC/bootstrap composer  
* No Audit package import  

### Phase 3 Definition of Done

* [ ] C4, C8 green  
* [ ] `tenancy.organization.created` observable via outbox/relay  

### Phase 3 risks

| Risk | Mitigation |
| --- | --- |
| Encoding admin in Tenancy columns | Forbidden; wait for RBAC assignment |
| Cascading deletes across modules | Prefer events + handlers; careful policies only |

---

## Phase 4 — RBAC

### Capabilities

* Permission registry seeded from [permission-catalog.md](../reference/permission-catalog.md) (Core keys first)  
* Roles (org-scoped and system as designed)  
* Role–permission bindings  
* Assignments with optional `locationId` **authorization scope**  
* `authorize` evaluation: default deny  
* Admin APIs for role/assignment manage  
* **Org admin bootstrap:** on `tenancy.organization.created` (or membership activated per design), assign `organization.administrator` to owner via app composer or RBAC handler — **not** Tenancy importing RBAC circularly  

### Permission catalog integration

1. Load Core keys (Identity platform, Tenancy, RBAC, Audit read) into permission registry.  
2. Same-PR rule: new authorize checks ↔ catalog row (ADR-0006).  
3. Role examples from catalog legend: `organization.administrator` gets Core manage/read set per [rbac/design.md](../modules/rbac/design.md).  

### Role model (execution focus)

| Role | Bootstrap relevance |
| --- | --- |
| `organization.administrator` | Assigned to org owner at create — **exit requirement C7** |
| Later: `location.manager`, `staff`, `auditor` | Packs/Shared; not required to exit Core |

Assignment `locationId` authorizes; membership location is affinity only.

### Events

Catalog RBAC section — SECURITY, outbox-mandatory:

* `rbac.permission.registered` (seed)  
* `rbac.role.created|updated|deleted`  
* `rbac.role_assignment.granted|revoked|scope_changed`  

### Dependencies

| Depends on | Must not depend on |
| --- | --- |
| Identity, Tenancy facades | Audit |
| Outbox | Shared |

### Acceptance criteria

* Default deny proven by test  
* Bootstrap grants admin without requiring prior `rbac.assignment.manage` (documented exception)  
* Subsequent assignments require `rbac.assignment.manage`  
* No Audit import  

### Phase 4 Definition of Done

* [ ] C5, C7 green  
* [ ] Authorize used in at least one Tenancy or RBAC admin path  
* [ ] Core permission seeds ⊆ permission catalog  

### Phase 4 risks

| Risk | Mitigation |
| --- | --- |
| Owner bypass flag | Forbidden; use role assignment only |
| Bootstrap living inside Tenancy package | Prefer composition root / RBAC consumer |

---

## Phase 5 — Audit

### Capabilities

* Append-only audit record store  
* Idempotent projection from SECURITY events (Identity, Tenancy, RBAC minimum checklist)  
* Optional direct `record` API for modules allowed to call Audit later  
* Query path; host enforces `audit.read`  
* Retention posture aligned with audit design + ADR-0004 SECURITY class (no wipe-rebuild)  

### Audit event flow

```text
Producer (Identity/Tenancy/RBAC)
  → outbox (same TX as mutation)
  → relay
  → Audit consumer (idempotent on eventId)
  → append audit record

Optional: Audit emits audit.record.appended (sampled/off by default)
```

**Forbidden:** Identity/Tenancy/RBAC importing Audit to “write audit synchronously” as a substitute for outbox.

### Retention requirements

* Audit SoR append-only; corrections via new rows  
* Archive/purge only via controlled `audit.retention.*` flows with dual-control on purge  
* SECURITY domain events retained per ADR-0004 (≥ Audit category)  
* Do not rebuild Audit by truncate + replay  

### Acceptance criteria

* Mandatory kernel SECURITY projections present for implemented events  
* Re-delivery of same `eventId` ⇒ single logical audit effect  
* Architecture test: Identity/Tenancy/RBAC ↛ Audit  
* `audit.read` gated in host  

### Phase 5 Definition of Done

* [ ] C6 green  
* [ ] C9 complete (isolation + outbox + audit consume demo)  
* [ ] Kernel vertical slice demonstrable  

### Phase 5 risks

| Risk | Mitigation |
| --- | --- |
| Volume of session.issued | Sample/policy per catalog |
| Dual-write Audit + outbox without idempotency | Prefer event projection only for kernel |

---

## Phase 6 — Architecture Enforcement

Start scaffolding early; **must be blocking** before Shared exit.

### Boundary validation

Automate backlog B-01…B-06 / D-01…D-03 as applicable to existing packages:

* Identity ↛ any module  
* Identity/Tenancy/RBAC ↛ Audit  
* No Core → Shared/Product  
* No deep cross-module imports  

### Event catalog validation

* Emitted Core `type`s ⊆ [event catalog](../reference/event-catalog.md)  
* Prefer E-01…E-03 from [automation backlog](architecture-automation-backlog.md) before Shared  

### ADR-0006 compliance

* Outbox tests for SECURITY paths (O-01, O-03, O-04)  
* Exception process documented if any temporary waiver (time-boxed)  
* Foundation CI continues to require ADR/catalog/readiness files  

### CI requirements (minimum before Shared)

| Gate | Blocking? |
| --- | --- |
| Foundation file presence | Yes |
| Kernel boundary / Identity isolation | Yes |
| SECURITY outbox architecture tests | Yes |
| Event catalog allow-list for Core publishers | Yes (or warn→fail with dated flip) |
| Permission catalog scan | Progressive OK |

### Phase 6 Definition of Done

* [ ] Checklist E2–E4 enabled for Core packages  
* [ ] No open unboundaried exceptions on kernel edges  
* [ ] Automation backlog W1–W2 items tracked or done  

---

## Cross-Cutting Requirements

### Multi-tenancy expectations

* Tenancy owns org/location/membership truth; RBAC owns authorization  
* `organizationId` on tenant-scoped Core write models per designs  
* Platform Identity principals are global; membership binds them to orgs  
* Replay/rebuild later must be tenant-scoped by default (ADR-0004) — design consumers with `organizationId` on envelopes where applicable  

### Security expectations

* Default deny authorize  
* SECURITY events outbox-mandatory  
* No silent owner superuser  
* Invitation email bind rules enforced  
* Dual-control reserved for later FINANCIAL/purge ops — not required to exit Core, but do not invent shortcuts that will conflict  

### Event ownership expectations

* Producer module owns `type` and catalog row  
* Consumers depend on facade/contracts only along legal DAG  
* Catalog Status transitions when events first ship  
* No ad-hoc event strings  

### Replay/rebuild compatibility

* Consumers idempotent on `eventId` from day one (Audit especially)  
* `processed_events` (or equivalent) planned in consumer packages  
* Do not build Audit as disposable Reporting-style store  
* Core does not implement Reporting rebuild; envelopes must remain archive-friendly (stable types, ids)  

### Observability expectations

* Relay lag / failure metrics  
* Outbox depth and poison counts  
* Correlation ids propagated on envelopes  
* Bootstrap and authorize denials loggable without leaking secrets  

---

## Definition of Done (all Core phases)

| Phase | DoD summary |
| --- | --- |
| **1 Outbox** | Atomic outbox + validation + relay; C1–C2 |
| **2 Identity** | Independent facade; SECURITY outbox; C3 |
| **3 Tenancy** | Org/membership/invite; policy C8; C4 |
| **4 RBAC** | Seeds + authorize + admin bootstrap C5/C7 |
| **5 Audit** | Append-only projections; C6; C9 complete |
| **6 Enforcement** | Blocking CI on kernel boundaries + outbox + catalog |

**Program DoD:** Checklist **C1–C9** green and **E2–E4** blocking (or explicitly dated warn with flip date ≤ Shared start) **and** kernel demo path verified in non-prod.

---

## Exit Criteria — Before Shared Domains

Implementation may proceed to Parties / Catalog / Orders / Payments / Ledger **only when all of the following are true**:

### Required (hard gate)

1. **C1–C9** complete ([bootstrap-checklist.md](bootstrap-checklist.md)).  
2. **Phase 6** kernel boundary + SECURITY outbox tests **fail the build** on violation.  
3. **Kernel demo:** create principal → create organization → owner has `organization.administrator` → privileged Tenancy/RBAC action audited.  
4. **Invitation accept** rejects email mismatch.  
5. **Event catalog:** all Core `type`s actually emitted are listed; no unknown publishes in CI.  
6. **Permission catalog:** Core seeds ⊆ catalog; authorize uses catalog keys.  
7. **ADR-0001…0006** remain Accepted; no conflicting exceptions open on Identity independence or Audit DAG.  

### Per Shared module (additional — after hard gate)

| Next module | Extra precondition |
| --- | --- |
| **Parties** | Hard gate only |
| **Catalog** | Parties facade available if catalog references parties |
| **Orders** | Parties + Catalog available for commercial references |
| **Payments** | Orders (or explicit payment-without-order policy); **never** write Ledger tables |
| **Ledger** | Payments events designed/subscribed per ADR-0005; append-only + `externalRef` idempotency; FINANCIAL outbox tests planned (O-02) |

### Explicitly not required to start Parties

* Reporting module  
* Full cold archive implementation (stub tracked)  
* Product verticals  
* Fulfillment timing ADR (needed before Inventory auto-handlers, not Parties)

---

## Execution risk reduction checklist

| Practice | Why |
| --- | --- |
| Outbox before Identity SECURITY commit | Avoid rewrites |
| Bootstrap in composition root | Prevent Tenancy↔RBAC cycles |
| Architecture tests in same PR as feature | Prevent “fix later” |
| Catalog row in same PR as first emit | ADR-0006 |
| No Shared tables in Core PRs | Layer purity |
| Thin vertical slice over breadth | Prove DAG early |
| Time-box any exception ≤ 30 days for SECURITY | ADR-0006 |

---

## Traceability

| Artifact | Role |
| --- | --- |
| [core-bootstrap-plan.md](core-bootstrap-plan.md) | Module-level purpose/deps/exit |
| [bootstrap-checklist.md](bootstrap-checklist.md) | Gate IDs C*/E* |
| [architecture-automation-backlog.md](architecture-automation-backlog.md) | Automation IDs B/O/E/C |
| [event-catalog.md](../reference/event-catalog.md) | Event inventory |
| [permission-catalog.md](../reference/permission-catalog.md) | Permission inventory |
| ADR-0003 / 0004 / 0006 | Outbox, retention, enforcement |
| Module designs | Domain behavior detail |

---

## Document control

| Version | Date | Notes |
| --- | --- | --- |
| 1.0 | 2026-07-14 | Initial Core platform execution plan |
