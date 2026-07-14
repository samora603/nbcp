# Audit Module — Design

| Field | Value |
| --- | --- |
| **Module** | `audit` (`modules/audit` — future implementation) |
| **Layer** | Core Platform ([ADR-0002](../../adr/0002-domain-map.md)) |
| **Stack** | NestJS + Prisma ([ADR-0001](../../adr/0001-platform-technology-foundation.md)) |
| **Structure** | [Module standard](../../architecture/module-standard.md) |
| **Status** | Design only — no implementation in this document |
| **Last updated** | 2026-07-14 |

**Normative companion:** [Event contracts & outbox](../../architecture/event-contracts.md) ([ADR-0003](../../adr/0003-event-contracts-and-outbox.md)) — mandatory for security event projection

---

## 1. Purpose

The **Audit** module owns an **append-only** trail of security- and business-significant actions across NBCP.

It answers: *Who did what, to which target, in which organization (and location), when, and with what context?*

It is a **shared recording facility** usable by all Core, Shared Business, and Product modules. It is not a general application event bus and not a substitute for domain events used for workflow.

### In scope

- Append-only audit records (create once; **never update**; no delete in normal operation)
- Actor tracking (`PrincipalId`, system/actor kinds)
- Organization context (`OrganizationId`)
- Location context (`LocationId`, optional)
- Action tracking (stable action keys)
- Target tracking (type + id)
- Metadata capture (structured, redaction-aware)
- Query APIs for authorized investigators (org-scoped; platform break-glass separate)
- Retention policies and archival considerations

### Explicit non-goals

- Mutating or correcting history in place (corrections are **new** compensating records)
- Owning Identity credentials, Tenancy memberships, or RBAC role definitions
- High-volume debug/application logs (→ observability / logger)
- Replacing domain-event workflows (orders → inventory); audit may *mirror* sensitive outcomes
- Guaranteeing synchronous cross-module transactionality with every producer (prefer outbox → audit writer)

### Dependency rules (hard)

```text
identity ──────────┐
                   │  PrincipalId / Org / Location refs (facade validation on write optional)
tenancy ───────────┤
                   ▼
                 audit
                   ▲
                   │ record() from any module / app
          rbac, orders, payments, …
```

| Module | May depend on Audit? |
| --- | --- |
| Identity | **No** |
| Tenancy | **No** |
| RBAC | **No** (RBAC emits domain events; **app or audit consumers** / producers call Audit — producers may live in application layer of other modules **except** Identity/Tenancy/RBAC packages importing Audit). |

**Clarification for Core producers:** Domain map listed Audit depending on Identity and Tenancy. Identity, Tenancy, and RBAC **module packages must not import Audit**. Sensitive Identity/Tenancy/RBAC actions are audited by:

1. **Application/host orchestration** after a successful use case, and/or  
2. **Audit module event handlers** subscribing to their domain events (`identity.*`, `tenancy.*`, `rbac.*`) — Audit depends on event contracts (public facades), not the reverse.

Shared Business and Product modules **may** call `audit.record` from their application layer (one-way dependency toward Audit).

---

## 2. Append-only contract (normative)

1. An `AuditRecord` is immutable after insert.
2. **No UPDATE** statements against audit facts in application code or migrations for content correction.
3. **No DELETE** of audit facts in application APIs. Operational purge only via controlled retention jobs (see §13), preferably **archive-then-purge** with dual control.
4. Mistakes are corrected by appending a new record that references the prior `auditRecordId` (`correctionOf` / `supersedes` metadata) — never by editing the original.
5. Storage engine permissions should deny update/delete to the app DB role where feasible (Postgres grants / RLS policies).

---

## 3. Ubiquitous language

| Term | Meaning in Audit |
| --- | --- |
| **Audit record** | One immutable fact about an action |
| **Actor** | Who/what performed the action (`principal`, `system`, `automation`, `anonymous` for pre-auth) |
| **Action** | Stable key for what happened (e.g. `rbac.role_assignment.granted`) |
| **Target** | Primary entity affected (`targetType` + `targetId`) |
| **Organization context** | Tenant in which the action occurred (nullable for pure platform/identity-global actions) |
| **Location context** | Optional branch/site scope |
| **Metadata** | Structured JSON bag — non-secret context (diffs, reason codes); secrets forbidden |
| **Correlation id** | Ties audit rows to request/trace/domain-event ids |
| **Outcome** | `success` \| `failure` \| `denied` (e.g. authz denial optional sampling) |

---

## 4. Bounded context & aggregates

Audit is write-mostly and simple: treat each record as an **AuditRecord aggregate** that is created and never mutated.

| Aggregate | Responsibility |
| --- | --- |
| **AuditRecord** | Single append-only fact |

Optional future: **AuditExportJob** aggregate for async exports — out of scope for v1 design depth.

```text
AuditRecord (AR)
├── actor
├── action
├── target
├── organizationId?
├── locationId?
├── metadata
├── occurredAt / recordedAt
└── correlation / outcome
```

No child entities that can be updated independently. Related facts are separate records linked by metadata/`correlationId`.

---

## 5. Aggregates (detail)

### 5.1 AuditRecord

**Invariants:**

1. `id` is unique and never reused.
2. `action` is non-empty and matches naming convention.
3. `recordedAt` is set at persistence time; `occurredAt` may equal or precede it (clock skew policy documented).
4. `metadata` must not contain passwords, session tokens, raw card data, or reset tokens (redaction at producer + audit ingest validation).
5. If `organizationId` is present, queries for tenant users are scoped to that org (enforced at read API with RBAC — callers outside Identity/Tenancy/RBAC use authorize).
6. Platform-global identity events may omit `organizationId` (e.g. password reset before tenant selection).

---

## 6. Entities

None beyond the aggregate root for v1. Avoid “mutable audit line items.”

---

## 7. Value objects

| Value object | Description |
| --- | --- |
| **AuditRecordId** | Opaque id |
| **Actor** | `{ kind: 'principal' \| 'system' \| 'automation' \| 'anonymous'; principalId?: PrincipalId; displayLabel?: string }` |
| **PrincipalId** | From Identity — stored as opaque reference |
| **OrganizationId** | From Tenancy — optional |
| **LocationId** | From Tenancy — optional |
| **ActionKey** | Stable string, preferably aligned with domain event type or `resource.action` (`rbac.role_assignment.granted`) |
| **TargetRef** | `{ type: string; id: string }` e.g. `{ type: 'rbac.role_assignment', id: '…' }` |
| **AuditMetadata** | Validated JSON object; size-capped; deny-listed keys stripped |
| **CorrelationId** | Request/trace/event correlation |
| **AuditOutcome** | `success` \| `failure` \| `denied` |
| **SourceModule** | Producing module name (`identity`, `tenancy`, `rbac`, `inventory`, …) |

---

## 8. Domain events

Audit primarily **consumes** other modules’ events and **records** facts. It may emit:

| Event | When | Notes |
| --- | --- | --- |
| `audit.record.appended` | After successful append | Optional; high volume — default **off** or sampled; prefer not to fan-out |
| `audit.retention.archived` | Batch archived | Ops |
| `audit.retention.purged` | Batch purged after archive | Dual-control |

Producers should not require `audit.record.appended` for correctness.

---

## 9. Public APIs (module facade)

### 9.1 Write

| API | Behavior |
| --- | --- |
| `record(input: AppendAuditCommand): Promise<AuditRecordId>` | Append exactly one immutable record; reject if validation fails |
| `recordMany(inputs): Promise<AuditRecordId[]>` | Batch append (same invariants); atomic batch preferred |

`AppendAuditCommand` fields:

- `actor: Actor` (required)
- `action: ActionKey` (required)
- `target?: TargetRef`
- `organizationId?: OrganizationId`
- `locationId?: LocationId`
- `metadata?: AuditMetadata`
- `occurredAt?: Date`
- `correlationId?: CorrelationId`
- `outcome?: AuditOutcome` (default `success`)
- `sourceModule: SourceModule`

Optional ingest: validate principal/org/location existence via Identity/Tenancy facades (**best-effort** — do not fail audit of break-glass if directory briefly unavailable; policy: record with `metadata.validation = 'skipped'` vs fail-closed for strict environments — **default: fail-open on directory validation failure but always persist the action**, and flag metadata). Soft recommendation: **prefer fail-open for audit durability** after a successful business action.

### 9.2 Read

| API | Behavior |
| --- | --- |
| `getById({ auditRecordId, organizationId? })` | Fetch one; enforce tenant scope |
| `query(filter: AuditQuery)` | Filter by org, location, actor, action, target, time range; cursor pagination |
| `export(filter)` | Async export job hook (future) |

Reads for tenant users require RBAC permission such as `audit.read` (enforced in **application host** / query use case calling RBAC — Audit query service receives an already-authorized context or calls RBAC if allowed by dependency policy).  

**Dependency nuance:** Audit **may** depend on RBAC for **read authorization** of tenant investigators **or** leave enforcement to the API host to keep Audit free of RBAC. **Decision for this design:** **API host / query BFF enforces `audit.read` via RBAC**; Audit query APIs assume a trusted internal caller with `TenantContext` pre-validated. This preserves “RBAC must not depend on Audit” and avoids Audit↔RBAC cycles.

Platform operators use a separate break-glass read path with dual control (future runbook).

### 9.3 HTTP surface (illustrative)

- `GET /v1/organizations/:organizationId/audit-records`
- `GET /v1/organizations/:organizationId/audit-records/:id`
- No `PATCH`/`PUT`/`DELETE` for records

### 9.4 Usage by future modules

Any module’s application layer (except Identity/Tenancy/RBAC packages):

```text
await useCase.execute(...)
await audit.record({ action, actor, organizationId, target, metadata, sourceModule })
```

Or subscribe in Audit to domain events for Core modules that cannot depend on Audit.

---

## 10. Dependencies

| Depends on | Usage |
| --- | --- |
| **Identity** (facade, optional on write) | Validate / resolve `PrincipalId` for actor |
| **Tenancy** (facade, optional on write) | Validate org/location when provided |

| Must not be depended on by | Reason |
| --- | --- |
| Identity, Tenancy, RBAC packages | Keep kernels free of audit I/O; use events → Audit handlers or host orchestration |

Technical ports: `Clock`, `IdGenerator`, persistence, archival storage port, redaction policy.

---

## 11. Database ownership

Audit owns all `audit_*` tables. Other modules must not write them except through the Audit facade.

| Table | Contents |
| --- | --- |
| `audit_records` | id, occurred_at, recorded_at, actor_kind, actor_principal_id, organization_id, location_id, action, target_type, target_id, outcome, source_module, correlation_id, metadata jsonb, schema_version |

**Constraints:**

- Application DB role: `INSERT`, `SELECT` only on `audit_records` (no `UPDATE`/`DELETE`).
- Indexes: `(organization_id, occurred_at DESC)`, `(actor_principal_id, occurred_at DESC)`, `(action, occurred_at DESC)`, `(target_type, target_id)`, `(correlation_id)`.

**Corrections:** new row with `metadata.correctionOf = '<priorId>'` and action e.g. `audit.correction.appended`.

---

## 12. Integration patterns

### 12.1 Preferred for Identity / Tenancy / RBAC

```text
rbac.assignRole → emit rbac.role_assignment.granted
        ↓
audit handler → audit.record(...)
```

### 12.2 Preferred for Shared Business / Products

```text
inventory.adjustStock (use case)
  → persist stock
  → emit inventory.stock.adjusted
  → audit.record(...)  // same app service or outbox projection
```

### 12.3 Outbox

For reliability, write business outbox + audit outbox in one transaction, or have Audit consume domain outbox events exactly once (idempotency key = event id → `correlationId` / unique constraint on `(source_module, correlation_id, action)` when provided).

---

## 13. Retention considerations

| Topic | Guidance |
| --- | --- |
| **Default retention** | Configurable per deployment; suggest ≥ 1 year for security events; longer for payments/ledger-related audits (regulatory) |
| **Hot vs cold** | Hot Postgres for recent N months; archive to object storage (compressed JSONL) via job |
| **Purge** | Only after successful archive verification; dual approval for production; emit `audit.retention.purged` |
| **Legal hold** | Flag orgs/actions exempt from purge (`legal_hold` table future) |
| **PII** | Minimize in metadata; prefer ids; hash or omit IPs when policy requires; align with privacy ADR |
| **Tenant export / delete** | GDPR-style requests: export audit slice for org; deletion may require anonymization of `actor_principal_id` via **append-only anonymization records** + future restricted rewrite under legal ADR — default preserve financial/security audits even when user deleted (store principal id; display redacted) |

Retention parameters live in config/secrets manager — not hard-coded in domain.

---

## 14. Security controls

1. Redact deny-listed metadata keys at ingest (`password`, `token`, `authorization`, `cardNumber`, …).
2. Cap metadata size (e.g. 16–64 KB) to prevent abuse.
3. Tenant query isolation mandatory.
4. Tamper evidence: optional hash chain / signing in a later ADR; v1 relies on DB grants + append-only discipline.
5. Clock: prefer server `recordedAt`; accept client `occurredAt` only within skew bounds.

---

## 15. Examples

All examples show the logical `record` payload after a successful action (or derived from a domain event).

### 15.1 Role assignment

```text
action:          rbac.role_assignment.granted
actor:           { kind: principal, principalId: P_admin }
organizationId:  Org_1
locationId:      null                    // org-wide assignment
target:          { type: rbac.role_assignment, id: Asgn_9 }
sourceModule:    rbac
outcome:         success
metadata:
  assigneePrincipalId: P_mgr
  roleKey:             location.manager
  roleId:              Role_LocMgr
  assignmentLocationId: Loc_Downtown
correlationId:   evt_rbac_asgn_9
```

### 15.2 Membership removal

```text
action:          tenancy.membership.removed
actor:           { kind: principal, principalId: P_admin }
organizationId:  Org_1
locationId:      null
target:          { type: tenancy.membership, id: Mem_44 }
sourceModule:    tenancy
outcome:         success
metadata:
  removedPrincipalId: P_staff
  reasonCode:         policy_violation
correlationId:   evt_tenancy_mem_44
```

*(Written by Audit handler on `tenancy.membership.removed` — Tenancy package does not import Audit.)*

### 15.3 Password reset

```text
action:          identity.password_reset.completed
actor:           { kind: principal, principalId: P_user }   // the account owner
organizationId:  null                    // global identity concern
locationId:      null
target:          { type: identity.user, id: P_user }
sourceModule:    identity
outcome:         success
metadata:
  sessionsRevoked: true
  // NEVER include reset token or new password
correlationId:   evt_identity_pw_reset_12
```

### 15.4 Inventory adjustment

```text
action:          inventory.stock.adjusted
actor:           { kind: principal, principalId: P_mgr }
organizationId:  Org_1
locationId:      Loc_Downtown
target:          { type: inventory.stock_item, id: Sku_100 }
sourceModule:    inventory
outcome:         success
metadata:
  delta:       -3
  quantityAfter: 42
  reasonCode:  damage
  catalogItemId: Cat_55
correlationId:   req_abc123
```

### 15.5 Payment capture

```text
action:          payments.capture.succeeded
actor:           { kind: principal, principalId: P_cashier }
organizationId:  Org_1
locationId:      Loc_Downtown
target:          { type: payments.payment, id: Pay_77 }
sourceModule:    payments
outcome:         success
metadata:
  orderId:        Ord_900
  amount:         { currency: USD, minor: 4599 }
  provider:       stripe
  providerRef:    ch_…          // provider ids OK; no full PAN
correlationId:   evt_pay_cap_77
```

---

## 16. Testing requirements (when implemented)

| Layer | Focus |
| --- | --- |
| Unit | Redaction of forbidden metadata; size limits; correction links |
| Integration | Insert-only DB role; no update path; org-scoped query isolation |
| Consumer | Handler idempotency on domain event replay |
| Negatives | Identity/Tenancy/RBAC packages do not import `@nbcp/audit` |

---

## 17. Implementation roadmap (non-binding)

1. `audit_records` + `record` / `query` + insert-only grants
2. Handlers for Identity / Tenancy / RBAC security events
3. Adoption guide for Shared Business modules
4. Archival/retention worker
5. Optional hash-chain / WORM storage ADR

---

## 18. Related documents

- [Identity design](../identity/design.md)
- [Tenancy design](../tenancy/design.md)
- [RBAC design](../rbac/design.md)
- [Domain map — audit](../../architecture/domain-map.md)
- [Module standard](../../architecture/module-standard.md)
- [Eventing](../../architecture/eventing.md)
- [Security standards](../../standards/security.md)
- [ADR-0001](../../adr/0001-platform-technology-foundation.md) / [ADR-0002](../../adr/0002-domain-map.md)
