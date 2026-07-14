# ADR-0004: Event Retention, Replay, and Projection Rebuild

- **Status:** Accepted
- **Accepted:** 2026-07-14
- **Date:** 2026-07-14
- **Deciders:** Noventra platform architecture
- **Tags:** events, outbox, retention, replay, rebuild, reporting, ledger, audit, operations
- **Remediates:** Architecture hardening [S-01](../reviews/architecture-hardening-review.md); Shared Domains Review S-01; Platform Review rebuild gaps
- **Depends on:** [ADR-0001](0001-platform-technology-foundation.md), [ADR-0002](0002-domain-map.md), [ADR-0003](0003-event-contracts-and-outbox.md)

---

## Context

NBCP is a **modular monolith** ([ADR-0001](0001-platform-technology-foundation.md)) with **domain events** published through the **transactional outbox** ([ADR-0003](0003-event-contracts-and-outbox.md); [event-contracts.md](../architecture/event-contracts.md)).

Multiple consumers project those events:

| Consumer class | Examples | Nature of derived data |
| --- | --- | --- |
| **Workflow / ops** | Inventory on `orders.order.committed`; Notifications on security events | Side effects + module SoR updates |
| **Financial projection** | Ledger posts from `payments.capture.succeeded` | Writes into **Ledger** SoR (append-only journals) |
| **Analytics projection** | Reporting facts/MVs from Orders/Payments/Inventory/… | **Rebuildable** read models ([reporting/design.md](../modules/reporting/design.md) §2) |
| **Audit projection** | Audit records from Identity/Tenancy/RBAC/money events | **Append-only** Audit SoR ([audit/design.md](../modules/audit/design.md)) |

**Reporting** explicitly requires rebuildability from events/source modules. **Ledger** is the **financial system of record** for posted journals and balances derived from postings ([ledger/design.md](../modules/ledger/design.md) §§1–2, §4) — it must not be treated as a disposable cache. **Audit** trails must remain intact under recovery.

Without a platform retention/replay/rebuild policy (hardening S-01), operators cannot recover corrupted Reporting marts, cannot safely re-run projectors, and may accidentally “rebuild” financial books or destroy Audit.

**Recovery scenarios this ADR governs:**

1. Reporting fact table corruption or bad projector logic  
2. Need to re-project after fixing a consumer bug (idempotent replay)  
3. Partial tenant repair after bad deploy  
4. Disaster recovery of analytics (not substitute for Ledger/Payments/Orders backups)  
5. Legal/operational need to preserve financial and security event evidence  

---

## Decision

Adopt the following **platform-wide** policies for event retention, replay, projection rebuild, and Ledger protection. Detailed procedures live in runbooks; this ADR is normative policy.

### Definitions

| Term | Meaning |
| --- | --- |
| **Domain event** | Business fact published by a module (envelope per ADR-0003), typically first written to **outbox** |
| **Integration event** | Same envelope family when consumed for cross-module reaction; not a second bus product |
| **Outbox record** | Durable row guaranteeing publish-after-commit (ADR-0003) |
| **Audit event / record** | Append-only Audit SoR entry (`audit_records`) and/or security-classified domain events that feed Audit |
| **Analytics projection** | Reporting datasets/MVs and similar rebuildable read models |
| **Financial post** | Ledger journal entry created by a projector or API — becomes Ledger SoR once **posted** |

---

### Event Retention

Retention is by **classification**. Assign each `type` in the [event catalog](../reference/event-catalog.md) to one class. Defaults below are **minima** for multi-tenant SaaS; stricter legal holds override.

#### 1. Domain events (hot + cold)

| Aspect | Policy |
| --- | --- |
| **Hot retention** | Remain queryable/replayable online **≥ 90 days** after `occurredAt` |
| **Cold archive** | After hot window, archive to durable object storage (immutable, tenant-partitioned keys) |
| **Cold retention by class** | See classification table below |
| **Purge** | Only from hot store after successful archive verification; cold purge only after class TTL and no legal hold |

#### 2. Integration events

Same envelopes as domain events once published. **No separate shorter retention** — retention follows the event’s classification. Consumers’ `processed_events` markers retain ≥ hot window (recommend match hot retention).

#### 3. Audit events / records

| Aspect | Policy |
| --- | --- |
| **Audit SoR (`audit_records`)** | Append-only; retention per [audit/design.md](../modules/audit/design.md) (≥ 1 year security default; longer for money-adjacent) |
| **SECURITY-classified domain events** | Cold retain **≥ Audit SoR** for that category (support rebuild/investigation) |
| **Purge of Audit SoR** | Archive-then-purge with dual control only; never “rebuild” Audit by deleting history |

#### 4. Outbox records

| Aspect | Policy |
| --- | --- |
| **Until published** | Retain until relay success (or poison-queue ops resolution) |
| **After published** | Retain **≥ 90 days** (align hot domain event window) for evidence/debug |
| **Archive** | Optional copy into event archive stream at publish time (recommended: archive **is** the durable event log) |
| **Purge** | Allowed after hot TTL + archive ack; never purge unpublished rows |

#### Classification retention (cold)

| Class | Examples | Cold retain (minimum) |
| --- | --- | --- |
| **SECURITY** | Identity password/lockout, tenancy membership remove, RBAC assignment grant/revoke | ≥ 3 years (or = Audit money/security policy) |
| **FINANCIAL** | `orders.order.committed/cancelled`, `payments.capture/refund.*`, `ledger.journal.posted/reversed`, inventory valuation-related | ≥ 7 years or jurisdiction override |
| **OPERATIONAL** | Scheduling cancel, inventory adjust/receive/issue | ≥ 2 years |
| **ANALYTICS** | Events used only to feed Reporting with SoR still in source modules | ≥ 90 days hot; cold optional if SoR APIs can fully rebuild |

**Multi-tenant rule:** Archives and purges are **tenant-scoped** where possible; platform-wide purge jobs must filter `organizationId` (null allowed only for Identity-global SECURITY events).

---

### Replay Policy

#### When replay is permitted

| Permitted | Forbidden |
| --- | --- |
| Re-deliver archived/hot events to a **consumer** that is idempotent on `eventId` | “Replay” that **mutates** published event payloads |
| Rebuild **Reporting** (and similar analytics) from archive | Replay used to **delete/rewrite** Audit rows |
| Controlled re-run of Ledger **projector** only when creating **missing** journals (see Ledger rules) | Blind full replay that double-posts Ledger |
| Tenant-scoped replay for one `organizationId` | Cross-tenant replay without break-glass |

#### Who may initiate replay

| Role | Authority |
| --- | --- |
| **Platform ops** (on-call / data platform) | Tenant or full rebuilds for Reporting; documented Ledger gap-fill |
| **Tenant admin** | **Not** allowed to trigger platform replay/rebuild of financial projectors |
| **Engineers** | Non-prod freely; prod only via change ticket + ops |

#### Safety requirements

1. Replay jobs write an Audit (or ops log) entry: actor, scope, eventId range, consumers targeted.  
2. Default consumer mode: **skip if `eventId` already processed**.  
3. Prefer tenant-scoped windows.  
4. Rate-limit replay to protect monolith workers.  
5. Dry-run mode mandatory for first production use of a new projector version.

#### Idempotency requirements

1. Every projector maintains `processed_events(consumer_name, event_id)` (or equivalent).  
2. Ledger additionally enforces uniqueness on `(organizationId, source, externalRef)` for projected posts ([ledger/design.md](../modules/ledger/design.md)).  
3. Replay without idempotency store is **not permitted** in production.

---

### Projection Rebuild Policy

#### Reporting rebuild

1. Reporting facts/MVs are **disposable read models** ([reporting/design.md](../modules/reporting/design.md)).  
2. Rebuild process:  
   - Optionally truncate tenant (or full) fact tables for selected datasets  
   - Clear matching `processed_events` for those projectors **or** use rebuild-specific consumer group  
   - Replay events from archive (and/or re-fetch SoR snapshots where documented)  
   - Refresh MVs  
   - Verify row counts / checksums vs smoke queries  
3. Document per-dataset rebuild in `docs/runbooks/rebuild-projections.md` (follow-up).  
4. **Source modules win** on conflict with Reporting.

#### Other read-model rebuilds

Cache/read models outside Reporting (e.g. search indexes) follow the same idempotent replay rules; they must not write Core/Shared SoR tables except via official module APIs.

#### Tenant-scoped rebuilds

Preferred production mode: `organizationId = X`, event types subset, time range. Must not leak other tenants’ events into X’s facts.

#### Full rebuilds

Allowed in non-prod anytime; in prod only under incident severity with dual approval. Expect long runtime — schedule maintenance window; mark Reporting freshness APIs as stale.

---

### Ledger Protection Rules

| Rule | Policy |
| --- | --- |
| **Authoritative financial truth** | **Posted** `ledger_journal_entries` / `ledger_postings` ([ledger/design.md](../modules/ledger/design.md) §4 append-only) |
| **Balances** | Materialized aids; **rebuildable from postings only** — never from Reporting |
| **What may never be “rebuilt away”** | Posted journals must **not** be truncated/deleted by Reporting-style rebuild tools |
| **Corrections** | **Reversal entries** only — never UPDATE posted amounts |
| **Projector gap-fill** | If replay detects missing post for a FINANCIAL event: insert **new** journal via Ledger API with same `externalRef` (idempotent); never modify existing posted entry |
| **If wrong journal exists** | Reverse, then post replacement — not delete |
| **Reporting vs Ledger** | Dashboards do not redefine books; dispute resolution uses Ledger + Payments + Orders SoR |
| **Audit** | Financial post/reverse remain Audit-mandatory; rebuild tools must not suppress Audit |

**Payment/Orders truth:** Capture/refund SoR remains Payments; commercial commitment SoR remains Orders. Ledger records accounting effects; it does not replace Payments.

---

## Consequences

### Positive

- Clear recovery path for Reporting without threatening financial books  
- Aligns outbox (ADR-0003) with durable archive expectations  
- Protects Audit and Ledger append-only guarantees under ops pressure  
- Tenant-scoped rebuilds fit multi-tenant SaaS  

### Trade-offs

- Storage cost for FINANCIAL/SECURITY cold retention  
- Replay tooling and ops skill required  
- Rebuild ≠ instant; freshness SLAs needed  
- Classification must be maintained in the [event catalog](../reference/event-catalog.md) (S-02)  

### Operational responsibilities

| Role | Responsibility |
| --- | --- |
| **Platform ops** | Archive jobs, purge controls, execute rebuild/replay, dual-control for FINANCIAL |
| **Module owners** (Ledger, Reporting, Payments, …) | Idempotent consumers; classify new event types |
| **Security / compliance** | Retention overrides, legal hold |
| **Engineering** | Envelope/outbox implementation; no ad-hoc purge of SoR |

---

## Follow-up actions

### Documentation

1. ~~Publish event catalog with classification / replay columns (hardening S-02).~~ → [docs/reference/event-catalog.md](../reference/event-catalog.md).  
2. ~~Publish Reporting rebuild runbooks.~~ → [tenant-projection-rebuild.md](../runbooks/tenant-projection-rebuild.md), [full-reporting-rebuild.md](../runbooks/full-reporting-rebuild.md).  
3. ~~Publish event replay runbook.~~ → [event-replay.md](../runbooks/event-replay.md).  
4. Link from [event-contracts.md](../architecture/event-contracts.md) and [reporting/design.md](../modules/reporting/design.md).  
5. ~~Companion financial ownership ADR.~~ → [ADR-0005](0005-financial-truth-and-projection-ownership.md) (Accepted).  

### Implementation (when coding begins — not part of this ADR authoring)

1. Durable event archive writer at outbox publish.  
2. `processed_events` (or equivalent) in each projector.  
3. Rebuild CLI/job with tenant scope + Audit/ops logging.  
4. Guarantees that Reporting rebuild tooling cannot TRUNCATE `ledger_*` / `audit_*` / `payments_*` / `orders_*`.  

---

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| Rebuild Reporting only from live SoR APIs, discard events | Loses historical deltas; harder SECURITY investigation; weakens Audit correlation |
| Treat Ledger as rebuildable projection like Reporting | Violates financial SoR and append-only designs |
| Infinite hot retention of all events in primary OLTP | Cost and table bloat on monolith Postgres |
| Tenant admins self-serve financial replay | Cross-tenant and fraud risk |

---

## References

- [architecture-hardening-review.md](../reviews/architecture-hardening-review.md)  
- [ADR-0003](0003-event-contracts-and-outbox.md) · [event-contracts.md](../architecture/event-contracts.md)  
- [ledger/design.md](../modules/ledger/design.md) · [reporting/design.md](../modules/reporting/design.md) · [audit/design.md](../modules/audit/design.md) · [payments/design.md](../modules/payments/design.md)  
- [ADR-0001](0001-platform-technology-foundation.md) · [ADR-0002](0002-domain-map.md)
