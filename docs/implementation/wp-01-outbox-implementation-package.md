# WP-01 — Outbox Foundation Implementation Package

**Status:** Implementation preparation (ready for coding after review)  
**Work package:** [WP-01 Outbox Foundation](core-kernel-backlog.md#work-package-01--outbox-foundation)  
**Milestone:** M1 Kernel Foundation  
**Checklist gates:** C1, C2 ([bootstrap-checklist.md](bootstrap-checklist.md))  
**Policy:** [ADR-0003](../adr/0003-event-contracts-and-outbox.md), [ADR-0004](../adr/0004-event-retention-replay-rebuild.md), [ADR-0006](../adr/0006-architecture-enforcement-and-governance.md), [event-contracts.md](../architecture/event-contracts.md)  
**Catalog:** [event-catalog.md](../reference/event-catalog.md)  
**Last updated:** 2026-07-14  

This package is the **pre-code briefing** for Outbox Foundation. It deliberately omits schemas, API contracts, and framework choices so implementers can select stack detail consistent with ADR-0001 without contradicting platform policy.

---

## Scope

### In scope

The Outbox Foundation is a **technical platform capability** (not a Core domain module). It owns:

| Responsibility | Description |
| --- | --- |
| **Unit of work integration** | A transactional boundary callers use so aggregate writes and outbox appends commit or roll back together |
| **Envelope validation** | Reject incomplete domain-event envelopes before they are accepted into the outbox |
| **Durable pending publication** | Persist unpublished event envelopes until successfully relayed |
| **Relay / publication lifecycle** | After commit, attempt delivery at-least-once; track published vs failed/poison |
| **Observability hooks** | Expose enough signal for depth, lag, failures, and poison (metrics/logs — not a product UI) |
| **Test harness** | Fixtures/helpers so WP-02+ can assert “SECURITY mutation ⇒ outbox row in same UoW” |
| **Archive seam (minimum)** | A defined extension point to copy envelopes into the durable event archive path at (or immediately after) successful publish — full cold store may be stubbed with an explicit follow-up |

### Out of scope

| Item | Deferred to |
| --- | --- |
| Domain event **payload** semantics and `type` ownership | Producer modules + event catalog |
| Audit / RBAC / Reporting / Ledger consumers | WP-05 / Shared later |
| Choosing broker product (Kafka, etc.) | Deferred per ADR-0001; worker/in-process relay sufficient |
| HTTP or public API surface for outbox | None required for WP-01 |
| Database DDL / ORM mappings | Implementation PR (not this package) |
| Event catalog CI parser (full E-01…E-03) | WP-06; WP-01 must not emit unknown types in fixtures if typed as production publishes |
| Production dual-control replay jobs | [event-replay.md](../runbooks/event-replay.md) — consumers must be ready; relay need not implement replay UI |
| FINANCIAL-specific Ledger gap-fill | ADR-0005 / later WPs |

### Non-goals

* Becoming a “god” event domain module that imports Identity/Tenancy/…  
* Synchronous cross-module side effects inside the producer transaction beyond outbox append  
* Guaranteeing exactly-once delivery to consumers (at-least-once + consumer idempotency is the model)

---

## Architectural Responsibilities

### Unit of Work integration

1. Application use cases obtain a **Unit of Work (UoW)** (or equivalent transactional session) from the platform layer.  
2. Within one UoW, modules may:  
   - Persist aggregate state changes (module-owned stores)  
   - Append one or more validated envelopes to the outbox  
3. **Commit** makes both visible together; **rollback** makes neither visible.  
4. Domain modules must not open a second, unrelated transaction for outbox append for mandatory classes (SECURITY/FINANCIAL and ADR-0006 mandatory BUSINESS).  
5. The outbox writer must be **invoked only with an active UoW** for durable publish paths — “append after commit without row” is forbidden for mandatory classes ([ADR-0006](../adr/0006-architecture-enforcement-and-governance.md)).

### Transaction boundaries

| Boundary | Rule |
| --- | --- |
| **Producer mutation + outbox insert** | Same transaction |
| **Relay read / mark published** | Separate transactions after producer commit |
| **Consumer processing** | Separate from producer; own idempotency store |
| **Archive copy** | Must not weaken producer atomicity; preferably after successful publish mark, or same as publish ack — never the only durability for SECURITY |

**Crash model**

* Crash after commit, before relay success → row remains unpublished → relay retries.  
* Crash during consumer → redelivery allowed → consumer must ignore duplicate `eventId`.  
* Crash before commit → no aggregate change, no outbox row.

### Event persistence

1. Persist the **full envelope** (not a pointer that still requires uncommitted memory).  
2. Persist enough metadata for relay: uniqueness of `eventId`, unpublished status, optional attempt count / last error, timestamps.  
3. Support multiple envelopes per UoW (one use case, several facts).  
4. Unpublished rows are **never** eligible for purge ([ADR-0004](../adr/0004-event-retention-replay-rebuild.md) outbox retention).  
5. After published: retain ≥ 90 days hot for evidence/debug (align hot window); archive recommended at publish.

**Ownership of storage:** Platform/technical package preferred; module-prefixed outbox allowed only if shared platform store is deferred — still infrastructure, not a domain module ([event-contracts.md](../architecture/event-contracts.md) §3.3).

### Event publication lifecycle

```text
[validate envelope]
       ↓
[append to outbox in open UoW]
       ↓
[commit UoW] ──rollback──► nothing published
       ↓
[relay claims unpublished row]
       ↓
[dispatch to consumers / bus]
       ↓
 success → mark published (+ optional archive copy)
 failure → increment attempts / schedule retry
 exhausted → poison state (ops visible; do not silent-drop SECURITY/FINANCIAL)
```

**Dispatch characteristics**

* At-least-once.  
* Order is best-effort unless a future ADR requires ordering keys — consumers must not assume global total order.  
* Prefer preserving `organizationId` for tenant-scoped filtering in later replay.

### Failure handling expectations

| Failure | Expected behavior |
| --- | --- |
| Validation failure | Reject append; UoW should not commit invalid publish intent |
| Relay transient error | Retry with backoff; leave unpublished |
| Relay persistent / poison | Quarantine for ops; alert; **do not delete** SECURITY/FINANCIAL unpublished rows |
| Duplicate `eventId` on append | Reject or no-op per uniqueness policy — never two durable distinct rows for same `eventId` |
| Consumer failure | Retry at consumer layer; does not rewrite outbox envelope |
| Partial multi-event UoW | All appends in UoW commit together or none |

Missing outbox on a mandatory SECURITY path is a **severity-elevated defect** (ADR-0006), not a UX bug.

---

## Dependencies

### Required (WP-01 cannot complete without)

| Dependency | Nature | Notes |
| --- | --- | --- |
| **Durable transactional store access** | Technical platform | Any ADR-0001-consistent persistence; schema design is out of this doc |
| **Clock / id generation ports** | Technical | Stable `occurredAt`; unique `eventId` (ULID/UUIDv7-class) |
| **Process to run relay** | App/worker host | Composition root — not Identity |
| **Logging/metrics sink** | Platform ops baseline | Lag, depth, poison |

### Explicitly not required

| Non-dependency | Why |
| --- | --- |
| Identity / Tenancy / RBAC / Audit modules | Outbox must not create domain DAG edges |
| Event catalog runtime package | Catalog is docs authority; validation can start as fixture discipline |
| Message broker product | Optional; in-process/queue worker acceptable |
| Notifications / mail | Irrelevant to outbox |

### Downstream dependents (unblocked by WP-01)

* WP-02 Identity (and all later Core SECURITY publishers)  
* WP-05 Audit consumers (need relay)  
* WP-06 outbox architecture tests (O-01, O-03, O-04)

---

## Domain Contracts

WP-01 does **not** own domain payloads. It enforces **envelope** and **publication** contracts so producers remain catalog-aligned.

### Event envelope requirements

Every append **must** include ([event-contracts.md](../architecture/event-contracts.md) §2.2):

| Field | Requirement |
| --- | --- |
| `eventId` | Globally unique; idempotency key for consumers |
| `type` | Catalog `type` string (`module.resource.past_tense`) |
| `version` | Payload schema version; start at 1 |
| `occurredAt` | ISO-8601 UTC |
| `producer` | Module id (`identity`, `tenancy`, …) |
| `organizationId` | Tenant id or `null` for global Identity facts |
| `correlationId` | Request/trace id or `null` |
| `payload` | Object; type-specific; additive evolution within version |

**Validation rules for WP-01**

* Reject missing/empty required fields.  
* Reject obviously non-conforming `type` (e.g. empty, whitespace) — full catalog allow-list may land in WP-06 but fixtures should only use catalog types.  
* Do not mutate producer payload during relay.  
* Do not change `eventId` after append.

### Event ownership requirements

| Rule | Implication for outbox |
| --- | --- |
| Producer module owns `type` and payload contract | Outbox stores opaque payload; no reinterpretation |
| Only owner publishes its prefix | Outbox does not invent types |
| Catalog registration before/with first emit | WP-01 fixtures use Planned/published catalog types; Domain WPs update Status |
| No deep imports for event types | Outbox package must not force domain modules to import each other |

### Idempotency expectations

| Layer | Expectation |
| --- | --- |
| **Outbox append** | `eventId` unique — duplicate append is reject/idempotent no-op |
| **Relay** | May deliver the same published envelope more than once to consumers |
| **Consumers** (not WP-01 code, but contract WP-01 enables) | Must treat `eventId` as processed key; WP-01 docs/tests state this clearly for WP-05 |
| **Ledger later** | Additional business `externalRef` — outbox must not prevent carrying such keys inside payload |

### Replay compatibility requirements

Align with [ADR-0004](../adr/0004-event-retention-replay-rebuild.md) and [event-replay.md](../runbooks/event-replay.md):

1. Envelopes remain **immutable** after publish — replay re-delivers, never edits payloads.  
2. Retention: unpublished kept until success; published ≥ 90 days hot; archive seam prepared.  
3. Envelopes must remain queryable by `organizationId`, `type`, `occurredAt`/`eventId` for future replay jobs (capability — not a public API in this package).  
4. Relay must not be the only long-term store if archive is stubbed — track full archive as exit debt before money-path production.  
5. WP-01 should provide a **test double or hook** that re-feeds a stored envelope to a consumer for “replay simulation” in later tests (optional in M1, required before claiming replay-ready infrastructure).

---

## Testing Requirements

### Unit tests

| Case | Expectation |
| --- | --- |
| Valid envelope accepted | Passes validation |
| Missing `eventId` / `type` / `version` / `occurredAt` / `producer` / `payload` | Rejected |
| `organizationId` null allowed | Accepted (Identity-global pattern) |
| Duplicate `eventId` append policy | Deterministic reject or no-op |
| Retry classification | Transient vs poison heuristics documented by test |

### Integration tests

| Case | Expectation |
| --- | --- |
| Commit UoW with mutation + outbox | Both durable after commit |
| Rollback UoW | Neither mutation nor outbox visible |
| Multi-envelope UoW | All or none |
| Relay happy path | Unpublished → published; consumer invoked ≥1 |
| Relay after process restart | Unpublished rows still processed |

Use a disposable test double aggregate/table **inside the technical package or test kit** — do not require Identity module for WP-01 completion.

### Failure-path tests

| Case | Expectation |
| --- | --- |
| Relay fails N times | Remains unpublished; attempts recorded |
| Poison after threshold | Quarantined; alert/log; row retained |
| Dispatch throws | Row not falsely marked published |
| Mark-published fails after dispatch | Safe retry / at-least-once to consumer (document chosen behavior) |

### Replay tests

| Case | Expectation |
| --- | --- |
| Re-deliver same published `eventId` to idempotent test consumer | Second apply skipped / no double effect |
| Dry-run listing | Can enumerate envelopes in a window without mutating consumer SoR (harness-level OK) |

Full ops replay runbook automation is **not** WP-01 DoD; the **contract** and a **harness proof** are.

### Architecture tests

| Case | Expectation |
| --- | --- |
| Outbox package does not depend on `modules/*` domain packages | Import graph clean |
| Helper available: assert outbox row for a successful test mutation in same UoW | Ready for WP-02 O-01 style tests |
| Helper available: assert **no** outbox row after rolled-back UoW | O-03 precursor |

---

## Acceptance Criteria

Objective criteria (all must pass):

1. **Atomicity:** Given a successful UoW commit that includes an outbox append, both the test mutation and the outbox envelope are durable; given a rollback, neither is.  
2. **Validation:** Incomplete envelopes cannot be appended.  
3. **Relay:** An unpublished row is eventually published (or poison-quarantined) under continuous relay operation.  
4. **At-least-once:** A consumer may observe duplicate delivery of the same `eventId` without foundation corruption; test consumer is idempotent.  
5. **No domain DAG pollution:** Outbox technical package has zero dependencies on Identity/Tenancy/RBAC/Audit modules.  
6. **Harness:** WP-02 can call a documented helper to assert outbox presence/absence around UoW commit/rollback.  
7. **Observability:** Operators can see unpublished depth and poison/failure signals in non-prod.  
8. **Policy alignment:** README/package docs cite ADR-0003/0004; mandatory-class “publish without outbox” is documented as forbidden.  
9. **Checklist:** C1 and C2 are satisfiable.

---

## Definition of Done

WP-01 / **M1 Kernel Foundation** is done when:

* [ ] All Acceptance Criteria 1–9 met  
* [ ] Deliverables D1–D5 from [core-kernel-backlog.md](core-kernel-backlog.md) WP-01 complete  
* [ ] Unit + integration + failure-path tests green in CI for the technical package  
* [ ] Architecture graph check: no `modules/*` deps from outbox package  
* [ ] Test harness documented for WP-02 onboarding  
* [ ] Archive seam identified (implemented or explicitly stubbed with tracked follow-up issue)  
* [ ] Delivery lead records M1 complete on the kernel backlog tracker  
* [ ] No open exception waiving transactional outbox for future SECURITY paths  

**Not required for DoD:** Identity code, Audit consumers, full cold object storage, catalog CI allow-list job, broker.

---

## Risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Implementing Identity (WP-02) before outbox atomicity works | Rework all SECURITY publishes | Hard gate: no WP-02 merge without M1 |
| Exactly-once assumptions in early consumers | Duplicate Audit / side effects | Mandate `eventId` idempotency docs + replay test |
| Coupling outbox to a domain module | Breaks Identity independence | Keep package under technical `packages/` (or equivalent); ban `modules/*` imports |
| Silent drop of poison SECURITY rows | Compliance hole (K-01 regression) | Poison retains rows; alert; ops runbook note |
| Skipping archive entirely | Replay/rebuild debt | Stub + explicit ticket; block money-path later if still open |
| Over-scoping to Kafka/bus | Delays M1 | Worker/in-process dispatch only |
| Using non-catalog `type`s in “prod” fixtures | Catalog drift | Fixture types from event catalog only |
| Relay marks published before durable dispatch evidence | Lost events | Define publish ack ordering; prefer mark after successful handoff to durable consumer ingress or local durable dispatch log |
| Multi-tenant purge tooling later deletes unpublished | Catastrophic loss | Enforce unpublished purge ban in any future job design |

---

## Implementation kickoff checklist

Use at coding start (still no design forced here):

1. Confirm ADR-0003/0004/0006 Accepted.  
2. Confirm this package reviewed by Staff Eng + delivery lead.  
3. Create epic WP-01 with D1–D5 tasks.  
4. Implement technical package behind ports; keep domain modules out.  
5. Land tests before declaring M1.  
6. Hand harness doc to WP-02 owner.

---

## Traceability

| Artifact | Link |
| --- | --- |
| Backlog WP-01 | [core-kernel-backlog.md](core-kernel-backlog.md) |
| Execution Phase 1 | [core-platform-execution-plan.md](core-platform-execution-plan.md) |
| Bootstrap | [core-bootstrap-plan.md](core-bootstrap-plan.md) § Eventing |
| Envelope / outbox standard | [event-contracts.md](../architecture/event-contracts.md) |
| Automation IDs O-01…O-04 | [architecture-automation-backlog.md](architecture-automation-backlog.md) |
| Replay ops | [event-replay.md](../runbooks/event-replay.md) |

---

## Document control

| Version | Date | Notes |
| --- | --- | --- |
| 1.0 | 2026-07-14 | Initial WP-01 implementation package |
