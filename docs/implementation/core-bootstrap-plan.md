# Core Bootstrap Plan

**Status:** Implementation sequencing (documentation only)  
**Related:** [bootstrap-checklist.md](bootstrap-checklist.md), [core-platform-execution-plan.md](core-platform-execution-plan.md), [architecture-automation-backlog.md](architecture-automation-backlog.md), [ADR-0001](../adr/0001-platform-technology-foundation.md)–[ADR-0006](../adr/0006-architecture-enforcement-and-governance.md), module designs under `docs/modules/`  
**Last updated:** 2026-07-14  

Defines the **order and exit criteria** for Core scaffolding. Do not reorder to put Shared commerce ahead of outbox + Identity kernel.

**Recommended order**

1. Eventing / Outbox (technical foundation) — *may start in parallel with empty Identity skeleton*  
2. Identity  
3. Tenancy  
4. RBAC  
5. Audit  
6. Architecture Enforcement (CI gates wired as packages appear)

> User-facing list often says Identity first; **practically**, outbox/envelope ports must exist before Identity SECURITY events are production-grade. Treat Eventing as step 0/1 interlocking with Identity.

---

## 1. Eventing / Outbox

### Purpose

Provide transactional outbox, envelope validation, and relay so domain modules can publish reliably ([ADR-0003](../adr/0003-event-contracts-and-outbox.md), [ADR-0004](../adr/0004-event-retention-replay-rebuild.md)).

### Dependencies

* Database technical package / Prisma (or equivalent) access  
* No domain module deps

### Events

* None owned — infrastructure for all publishers  
* Archive hook at publish time (ADR-0004)

### Interfaces

* `UnitOfWork` / transaction port  
* `OutboxWriter.append(envelope)` in same TX as aggregate  
* `EventPublisher` facade used by application layer  
* Relay worker: unpublished → bus/in-process dispatch  
* Envelope schema validation (reject incomplete)

### Acceptance Criteria

* Same TX: mutation + outbox row; rollback removes both  
* Relay retries; poison handling documented  
* Incomplete envelope rejected at write

### Exit Criteria

* Architecture test helper usable by Identity SECURITY use cases  
* Docs: event-contracts linked from package README

---

## 2. Identity

### Purpose

Principals, credentials, sessions, password reset — **no** tenancy/RBAC/Audit imports ([identity/design.md](../modules/identity/design.md)).

### Dependencies

* Outbox/envelope ports  
* Zero `modules/*` dependencies

### Events

Per [event catalog](../reference/event-catalog.md) Identity section (`identity.user.*`, `identity.session.*`, `identity.password_reset.*`, …) — SECURITY, outbox-mandatory.

### Interfaces

* Public facade: register, authenticate, session issue/revoke, password flows, support admin as designed  
* Ports: clock, id, password hasher, mail (via Notifications later — port only)

### Acceptance Criteria

* Facade-only exports; domain pure  
* SECURITY mutations write outbox in same TX  
* Invitation/email flows do not create Tenancy deps

### Exit Criteria

* [ ] C3 + C9 Identity isolation tests green ([bootstrap-checklist.md](bootstrap-checklist.md))  
* Catalog types Status can move Planned→Published when emitted

---

## 3. Tenancy

### Purpose

Organizations, locations, memberships, invitations ([tenancy/design.md](../modules/tenancy/design.md)).

### Dependencies

* Identity (facade)  
* Outbox  
* Must not import RBAC or Audit

### Events

`tenancy.organization.*`, `tenancy.location.*`, `tenancy.membership.*`, `tenancy.invitation.*` — SECURITY, outbox-mandatory.

### Interfaces

* Facade: createOrganization, locations, memberships, invitations, acceptInvitation  
* Obeys [invitation-acceptance-policy.md](../architecture/invitation-acceptance-policy.md) and [tenant-access-model.md](../architecture/tenant-access-model.md)

### Acceptance Criteria

* `organizationId` on tenant data  
* Accept invitation email bind rules enforced  
* Owner transfer emits event; no admin-via-bypass flags

### Exit Criteria

* [ ] C4 green  
* Org create usable by bootstrap composer (next)

---

## 4. RBAC

### Purpose

Permissions, roles, assignments, `authorize` ([rbac/design.md](../modules/rbac/design.md)).

### Dependencies

* Identity (principal ids)  
* Tenancy (org/location context)  
* Outbox  
* Must not import Audit

### Events

`rbac.permission.*`, `rbac.role.*`, `rbac.role_assignment.*` — SECURITY, outbox-mandatory.

### Interfaces

* `authorize({ principalId, organizationId, permission, locationId? })`  
* Role/assignment admin APIs guarded by permission catalog keys  
* Seed loader for [permission-catalog.md](../reference/permission-catalog.md) Core keys  
* **Bootstrap composer** (app or RBAC handler): on `tenancy.organization.created` assign `organization.administrator` to owner

### Acceptance Criteria

* Default deny  
* Assignment `locationId` authorizes; membership location is affinity only  
* Bootstrap exception documented and tested

### Exit Criteria

* [ ] C5, C7 green  
* Permission catalog Core rows seeded

---

## 5. Audit

### Purpose

Append-only audit records; consume SECURITY (and later FINANCIAL) events ([audit/design.md](../modules/audit/design.md)).

### Dependencies

* May depend on Identity/Tenancy **facades** for enrichment if needed  
* Prefer consuming **events** for Identity/Tenancy/RBAC (they must not import Audit)  
* Outbox for Audit’s own rare events

### Events

Consumes catalog SECURITY events; publishes optional `audit.record.appended` (sampled), `audit.retention.*`.

### Interfaces

* `record` / append API for modules allowed to call Audit  
* Query API; host enforces `audit.read`  
* Idempotent consumer on `eventId`

### Acceptance Criteria

* No UPDATE/DELETE of audit rows in app APIs  
* Identity/Tenancy/RBAC packages have zero Audit imports (CI)  
* Mandatory checklist for kernel SECURITY events covered

### Exit Criteria

* [ ] C6, C9 Audit consumer tests green  
* Kernel Core stack demos register → org → admin → audited actions

---

## 6. Architecture Enforcement

### Purpose

Wire [ADR-0006](../adr/0006-architecture-enforcement-and-governance.md) gates so Core cannot erode ([architecture-automation-backlog.md](architecture-automation-backlog.md)).

### Dependencies

* Packages/modules exist to analyze  
* CI pipeline

### Events

* N/A (meta)

### Interfaces

* CI jobs: boundary graph, architecture test tag, catalog file presence  
* Exception register format (when first exception granted)

### Acceptance Criteria

* Boundary gate fails known forbidden edges  
* Outbox test fails if SECURITY path skips outbox  
* Required ADR/catalog files present in CI

### Exit Criteria

* [ ] Checklist E2–E4 enabled (warn or fail) before Shared commerce on main  
* Automation backlog items prioritized for next sprints

---

## Parallelism notes

| Parallel OK | Must wait |
| --- | --- |
| Outbox package + Identity skeleton | Tenancy before RBAC bootstrap |
| Audit consumer stubs while Tenancy stabilizes | Shared Orders before Payments |
| ADR-0006 config skeletons early | Reporting rebuild tools before prod rebuild |

---

## Document control

| Version | Date | Notes |
| --- | --- | --- |
| 1.0 | 2026-07-14 | Initial core bootstrap plan |
