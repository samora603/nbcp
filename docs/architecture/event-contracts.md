# Event Contracts & Outbox Standard

**Status:** Normative  
**ADR:** [ADR-0003](../adr/0003-event-contracts-and-outbox.md)  
**Remediates:** Kernel review [K-01](../reviews/kernel-review.md), [K-04](../reviews/kernel-review.md)  
**Last updated:** 2026-07-14  

This document defines how NBCP modules publish and consume domain events **without creating new module dependency edges** and without breaking Identity independence or the Product → Shared → Core direction.

Related: [eventing.md](eventing.md), [module-standard.md](module-standard.md), [audit design](../modules/audit/design.md).

---

## 1. Goals

1. Make security-relevant audit projection **reliable** (K-01).
2. Prevent cyclic coupling from cross-importing module internals for event types (K-04).
3. Keep the kernel DAG unchanged:

```text
identity ← tenancy
identity ← rbac
tenancy  ← rbac
identity ← audit
tenancy  ← audit
```

Identity still has **zero** module dependencies. Identity, Tenancy, and RBAC still **must not** import Audit.

---

## 2. Contract ownership (no new module deps)

### 2.1 Rule

Each domain module **owns** the contracts for events it publishes. Contracts are part of that module’s **public facade** (`src/index.ts` / `contracts/` export path), not infrastructure paths.

Consumers depend on the **producer module’s facade types** only when they already legally depend on that producer — **or** they depend on a future technical package `@nbcp/contracts` that contains **only** serializable DTOs and event envelopes with **no** imports from `modules/*` domain logic.

| Approach | Allowed? | Notes |
| --- | --- | --- |
| Consumer imports `@nbcp/tenancy` facade event types | Yes, if consumer may depend on tenancy | e.g. RBAC, Audit, Shared modules |
| Identity imports any other module’s events | **No** | Preserves Identity independence |
| Deep import `…/infrastructure/…` for events | **No** | Module standard ban |
| Mutual event-type imports between two modules | **No** | Cycle risk — redesign ownership |
| Technical `@nbcp/contracts` (DTOs only, no module deps) | Yes (future scaffold) | Does **not** add domain-module edges |

**Decision for remediation:** Prefer **producer-owned facade exports** now. Optionally extract pure DTOs into `@nbcp/contracts` later **without** changing the module DAG (technical package under `packages/`, not a Core domain module).

### 2.2 Envelope (normative shape)

Every published domain event MUST serialize to:

```text
{
  eventId:        string,          // ULID/UUIDv7 — globally unique; idempotency key
  type:           string,          // e.g. "tenancy.organization.created"
  version:        number,          // payload schema version, start at 1
  occurredAt:     string,          // ISO-8601 UTC
  producer:       string,          // module name: identity | tenancy | rbac | …
  organizationId: string | null,   // when tenant-scoped; null for global identity facts
  correlationId:  string | null,   // request/trace id when available
  payload:        object           // type-specific, additive evolution only
}
```

- **Breaking** payload changes require `version` bump or a new `type` name.
- Prefer **additive** fields within the same version.

### 2.3 Naming

- Past tense / fact style: `identity.user.password_changed`, `rbac.role_assignment.granted`.
- Align Audit `action` keys with event `type` when the audit row is projected from that event.

---

## 3. Transactional outbox (mandatory for security events)

### 3.1 Pattern

Within the **same database transaction** as the state mutation:

1. Persist aggregate changes (module-owned tables).
2. Insert one or more rows into an **outbox** table (or module-owned outbox) with the full event envelope.
3. Commit.
4. A relay/worker publishes to in-process bus / queue **after** commit.
5. Consumers process idempotently using `eventId`.

Never “fire and forget” publish before commit for security-relevant events.

### 3.2 Security-relevant event classes (K-01 — mandatory outbox)

At minimum, events of these types **must** use transactional outbox:

| Producer | Examples |
| --- | --- |
| **Identity** | user registered/suspended/deleted, password changed/reset completed, lockout, session revoked (policy may sample `session.issued`) |
| **Tenancy** | organization created/suspended/deleted, owner transferred, membership activated/suspended/removed/left, invitation accepted/revoked |
| **RBAC** | role created/updated/deleted, role_assignment granted/revoked |
| **Payments / Ledger** (shared) | capture/refund/posting events when those modules exist |
| **Any** event whose primary consumer is **Audit** for compliance | Treat as security-relevant |

### 3.3 Outbox storage ownership

| Option | When |
| --- | --- |
| **Platform outbox table** (`platform_outbox`) owned by a technical database package | Preferred for uniform relay |
| **Module-prefixed outbox** (`identity_outbox`, …) | Allowed if shared table deferred |

Outbox is **infrastructure**, not a new Core domain module. It does not change Identity→∅.

Identity writes outbox rows for its own events; Audit **reads/consumes** published events — Identity never imports Audit.

---

## 4. Consumers & idempotency

1. Consumers MUST treat `eventId` as an idempotency key (store processed ids per consumer group).
2. Consumers MUST tolerate at-least-once delivery.
3. Consumers MUST NOT write another module’s tables (module standard).
4. **Audit** consumes Identity/Tenancy/RBAC security events and calls internal `record` — this is the approved path so those packages never depend on Audit (K-01 + DAG).

### 4.1 Mandatory Audit projections (checklist)

| Event type (min) | Audit action (= type) |
| --- | --- |
| `identity.password_reset.completed` | same |
| `identity.user.password_changed` | same |
| `identity.user.locked_out` | same |
| `identity.user.suspended` / `deleted` | same |
| `tenancy.organization.created` | same |
| `tenancy.organization.owner_transferred` | same |
| `tenancy.membership.removed` / `left` / `suspended` | same |
| `tenancy.invitation.accepted` | same |
| `rbac.role_assignment.granted` / `revoked` | same |
| `rbac.role.updated` | same |

Missing projection of a checklist event is a **defect**, not optional polish.

### 4.2 Shared / Product producers

Modules that **may** depend on Audit MAY also call `audit.record` in the same application transaction **or** emit outbox events that Audit consumes. Prefer one consistent style per module; do not double-write without idempotency.

---

## 5. What this does *not* introduce

- No Identity → Tenancy / RBAC / Audit edges.
- No Tenancy → RBAC / Audit edges.
- No RBAC → Audit edge.
- No Product/Shared → reversed Core deps.
- No requirement for Kafka/NATS on day one (in-process + BullMQ relay is enough).

---

## 6. Testing expectations (when implemented)

1. Unit: envelope validation / versioning rules.
2. Integration: mutate + outbox row in one transaction; rollback removes both.
3. Consumer: replay same `eventId` ⇒ single audit row.
4. Boundary lint: Identity package has no imports of tenancy/rbac/audit.

---

## 7. Related documents

- [ADR-0003](../adr/0003-event-contracts-and-outbox.md)
- [ADR-0004](../adr/0004-event-retention-replay-rebuild.md) (retention, replay, rebuild — Accepted)
- [ADR-0005](../adr/0005-financial-truth-and-projection-ownership.md) (financial truth / Ledger vs Reporting — Accepted)
- [ADR-0006](../adr/0006-architecture-enforcement-and-governance.md) (boundaries, outbox, CI governance — Accepted)
- [Event catalog](../reference/event-catalog.md) (authoritative type inventory — remediates S-02 / P-02)
- [Kernel review](../reviews/kernel-review.md)
- [tenant-access-model.md](tenant-access-model.md) (org bootstrap uses events safely)
