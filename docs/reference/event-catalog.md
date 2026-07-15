# Event Catalog

**Status:** Authoritative inventory (canonical)  
**ADR alignment:** [ADR-0003](../adr/0003-event-contracts-and-outbox.md), [ADR-0004](../adr/0004-event-retention-replay-rebuild.md), [ADR-0005](../adr/0005-financial-truth-and-projection-ownership.md), [ADR-0006](../adr/0006-architecture-enforcement-and-governance.md), [ADR-0007](../adr/0007-orders-inventory-reservation-and-issue-timing.md)  
**Related:** [event-contracts.md](../architecture/event-contracts.md), [eventing.md](../architecture/eventing.md), [ADR-0001](../adr/0001-platform-technology-foundation.md), [ADR-0002](../adr/0002-domain-map.md)  
**Last updated:** 2026-07-14  
**Remediates:** Architecture hardening [S-02](../reviews/architecture-hardening-review.md) / [P-02](../reviews/architecture-hardening-review.md)

This document is the **canonical inventory** of NBCP platform domain events: names, owners, consumers, classification, replay eligibility, and versioning status.

All rows are **Planned** until the owning module is implemented and the event is emitted in production code, except where Status is marked **Published** (Identity / WP-02; Tenancy / WP-03 except `tenancy.invitation.expired` worker; RBAC / WP-04; Audit / WP-05; Parties / S1). Module design docs remain the narrative source for payloads; **this catalog is authoritative for type ↔ ownership ↔ class ↔ replay**.

---

## Purpose

### Why an event catalog exists

NBCP is a **modular monolith** that integrates modules through **domain events** published via the **transactional outbox** ([ADR-0003](../adr/0003-event-contracts-and-outbox.md)). Without a central inventory:

* Ownership and allowed consumers are tribal knowledge.
* Replay/rebuild operators cannot know which types are financial vs rebuildable analytics.
* Future modules cannot discover existing contracts before inventing duplicates.

The catalog closes **discoverability** and **governance** gaps so Reporting rebuild, Ledger protection, and Audit integrity ([ADR-0004](../adr/0004-event-retention-replay-rebuild.md)) have a typed inventory to attach policy to.

### Relationship to ADR-0004

[ADR-0004](../adr/0004-event-retention-replay-rebuild.md) requires each event `type` to be assigned a **retention/replay classification**. This catalog **is that assignment**. Operators and projector authors consult columns **Classification** and **Replayable** before any replay or Reporting rebuild. Financial and security rows never follow analytics rebuild procedures.

### Relationship to outbox publishing

Publish path (normative):

1. Owning module mutates SoR in a DB transaction.  
2. Same transaction inserts an **outbox** row with envelope (`type`, `organizationId`, `payload`, …).  
3. After commit, the outbox relay publishes; consumers process asynchronously with idempotency ([ADR-0003](../adr/0003-event-contracts-and-outbox.md)).

Only events listed here (or ADR-approved additions) may be published as first-class platform contracts. Ad-hoc string types in application code are prohibited.

---

## Event Naming Rules

### Wire format (canonical)

```text
{module}.{aggregate_or_resource}.{past_tense_verb}
```

| Rule | Requirement | Example |
| --- | --- | --- |
| **Past tense** | Verb describes a completed fact, not a command | `orders.order.committed` not `commit_order` |
| **Module prefix** | Equals owning module id ([ADR-0002](../adr/0002-domain-map.md)) | `payments.`, `ledger.`, `identity.` |
| **Aggregate ownership** | Middle segment is the owned aggregate/resource | `role_assignment`, `capture`, `stock` |
| **Snake case segments** | Lowercase `[a-z0-9_]+` per segment | `password_reset`, `email_verified` |
| **Version suffix** | Omit for v1; append `.v{N}` only for **incompatible** wire successors | `orders.order.committed.v2` |
| **Stable type string** | Once Published, `type` never changes meaning; evolve via new type or version | See Versioning |

**Documentation synonyms (non-wire):** PascalCase (`OrderPlaced`, `PaymentAuthorized`, `LedgerEntryPosted`) may appear in prose or language class names. They **must** map 1:1 to a catalog `type`. Prefer citing the wire `type` in ADRs, catalogs, and dashboards.

| Prose / class | Wire `type` |
| --- | --- |
| `OrderCommitted` | `orders.order.committed` |
| `PaymentCaptureSucceeded` | `payments.capture.succeeded` |
| `LedgerJournalPosted` | `ledger.journal.posted` |

### Deprecation handling

1. Mark **Status** = `Deprecated` with successor `type` and removal target date.  
2. Keep publishing both (or map old → new in producer) for the compatibility window.  
3. Consumers migrate; CI may fail new references to deprecated types after grace period.  
4. Remove producer emission only after catalog Status = `Retired` and ADR note (if widely used).

---

## Event Classification

Every inventory row has exactly one **primary** classification. Secondary tags (e.g. “also audited”) go in Consumer Rules / module design — not a second class.

Classes below extend ADR-0004’s SECURITY / FINANCIAL / OPERATIONAL / ANALYTICS with **BUSINESS** (commercial facts that are not themselves journal posts) and **AUDIT** (events owned by the Audit module about the Audit SoR lifecycle).

| Classification | Meaning | Retention class ([ADR-0004](../adr/0004-event-retention-replay-rebuild.md)) | Replay expectations | Consumer restrictions |
| --- | --- | --- | --- | --- |
| **SECURITY** | Authn, identity lifecycle, membership/RBAC grants, invitations, lockouts | SECURITY (≥ Audit SoR for category) | Replay for Audit backfill / auth projections only; never truncate for analytics reclaim | Audit **mandatory** for high-signal types; Identity/Tenancy/RBAC must not import Audit |
| **FINANCIAL** | Money movement, settlement, posted/reversed journals, tax-affecting commercial commit when policy treats it as money-adjacent for retention | FINANCIAL (≥ 7 years / legal hold; prefer indefinite hot+cold for ledger-driving) | Replay **only** with Ledger/Payments dual-control runbooks; **never** wipe posted journals to “re-apply” | Ledger, Payments, Audit, Reporting (read-model only); **no** Product module writes ledger from these without Ledger ownership |
| **BUSINESS** | Commercial / domain lifecycle that is not a ledger post (orders, catalog, parties, inventory movements as ops facts) | OPERATIONAL (≥ 2 years cold) unless elevated to FINANCIAL by finance policy | Replay for ops projectors and Reporting rebuild; Inventory side effects must be idempotent | Allowed Shared/Product consumers per ownership DAG; Audit for material types |
| **AUDIT** | Events **published by Audit** about Audit SoR / retention (not the audit records themselves) | Align with Audit SoR retention; do not treat as ANALYTICS | Rarely replayed; ops only | Prefer **not** fan-out; consumers optional/sampled |
| **OPERATIONAL** | Scheduling, notifications delivery lifecycle, export ops, conflict/lag signals | OPERATIONAL (≥ 2 years) | Replay for recovery of queues/status where idempotent | Notifications, product UX, ops; avoid financial postings from these alone |
| **ANALYTICS** | Events whose **primary** purpose is analytics/ops metrics (optional lag/export metrics); Reporting **inputs** are usually BUSINESS/FINANCIAL classified — Reporting rebuild uses those classes’ retention | ANALYTICS (≥ 2 years or regenerate) | Safe for Reporting-style rebuild when marked Replayable | Must **not** be sole evidence for Ledger or Audit |

**Financial vs non-financial:** Treat **FINANCIAL** (and Ledger-driving BUSINESS events such as `orders.order.committed` when used for revenue recognition policies) under ADR-0004 Ledger protection. Pure OPERATIONAL/ANALYTICS/AUDIT module lifecycle events are never used as journal evidence.

---

## Canonical Event Inventory

**Legend**

| Column | Meaning |
| --- | --- |
| **Event** | Wire `type` |
| **Owner Module** | Sole publisher |
| **Classification** | Primary class above |
| **Consumers** | Known/planned consumers (not an open subscription bus) |
| **Replayable** | `Yes` = idempotent consumer re-process allowed under ADR-0004; `Conditional` = dual-control / financial rules; `No` = do not bulk-replay |
| **Version** | Current contract version (`1` = unversioned suffix) |
| **Status** | `Planned` \| `Published` \| `Deprecated` \| `Retired` |

Populate-from: module `docs/modules/*/design.md` Event sections. Modules not yet implemented ⇒ **Planned**.

### Identity

| Event | Owner Module | Classification | Consumers | Replayable | Version | Status |
| --- | --- | --- | --- | --- | --- | --- |
| `identity.user.registered` | Identity | SECURITY | Notifications, Audit, Tenancy (optional) | Yes | 1 | Published |
| `identity.user.email_verified` | Identity | SECURITY | Audit | Yes | 1 | Published |
| `identity.user.activated` | Identity | SECURITY | Audit | Yes | 1 | Published |
| `identity.user.suspended` | Identity | SECURITY | Session revoke workers, Audit, Tenancy | Yes | 1 | Published |
| `identity.user.deactivated` | Identity | SECURITY | Session revoke, Audit | Yes | 1 | Published |
| `identity.user.deleted` | Identity | SECURITY | Session revoke, Tenancy handlers | Yes | 1 | Published |
| `identity.user.password_changed` | Identity | SECURITY | Session revoke, Audit, Notifications | Yes | 1 | Published |
| `identity.user.locked_out` | Identity | SECURITY | Audit, Notifications (optional) | Yes | 1 | Published |
| `identity.user.unlock` | Identity | SECURITY | Audit | Yes | 1 | Published |
| `identity.external_identity.linked` | Identity | SECURITY | Audit | Yes | 1 | Published |
| `identity.external_identity.unlinked` | Identity | SECURITY | Audit | Yes | 1 | Published |
| `identity.session.issued` | Identity | SECURITY | Audit (sampled/policy) | Conditional | 1 | Published |
| `identity.session.revoked` | Identity | SECURITY | Audit | Yes | 1 | Published |
| `identity.password_reset.requested` | Identity | SECURITY | Notifications | Yes | 1 | Published |
| `identity.password_reset.completed` | Identity | SECURITY | Session revoke, Audit | Yes | 1 | Published |

### Tenancy

| Event | Owner Module | Classification | Consumers | Replayable | Version | Status |
| --- | --- | --- | --- | --- | --- | --- |
| `tenancy.organization.created` | Tenancy | SECURITY | Audit, analytics stubs, billing entitlements stub | Yes | 1 | Published |
| `tenancy.organization.activated` | Tenancy | SECURITY | Audit | Yes | 1 | Published |
| `tenancy.organization.suspended` | Tenancy | SECURITY | Higher modules deny-write, Audit | Yes | 1 | Published |
| `tenancy.organization.archived` | Tenancy | SECURITY | Audit | Yes | 1 | Published |
| `tenancy.organization.deleted` | Tenancy | SECURITY | Cascade policy handlers, Audit | Conditional | 1 | Published |
| `tenancy.organization.owner_transferred` | Tenancy | SECURITY | Audit, RBAC, Notifications | Yes | 1 | Published |
| `tenancy.location.created` | Tenancy | SECURITY | Audit | Yes | 1 | Published |
| `tenancy.location.updated` | Tenancy | BUSINESS | Audit | Yes | 1 | Published |
| `tenancy.location.deactivated` | Tenancy | SECURITY | Scheduling/Inventory policies | Yes | 1 | Published |
| `tenancy.membership.created` | Tenancy | SECURITY | RBAC default roles, Audit | Yes | 1 | Published |
| `tenancy.membership.activated` | Tenancy | SECURITY | Audit, Notifications | Yes | 1 | Published |
| `tenancy.membership.suspended` | Tenancy | SECURITY | RBAC context invalidation, Audit | Yes | 1 | Published |
| `tenancy.membership.removed` | Tenancy | SECURITY | RBAC revoke, Audit | Yes | 1 | Published |
| `tenancy.membership.left` | Tenancy | SECURITY | RBAC revoke, Audit | Yes | 1 | Published |
| `tenancy.invitation.created` | Tenancy | SECURITY | Notifications, Audit | Yes | 1 | Published |
| `tenancy.invitation.accepted` | Tenancy | SECURITY | Membership activation, Audit | Yes | 1 | Published |
| `tenancy.invitation.declined` | Tenancy | SECURITY | Audit | Yes | 1 | Published |
| `tenancy.invitation.revoked` | Tenancy | SECURITY | Audit | Yes | 1 | Published |
| `tenancy.invitation.expired` | Tenancy | SECURITY | Audit | Yes | 1 | Planned |

### RBAC

| Event | Owner Module | Classification | Consumers | Replayable | Version | Status |
| --- | --- | --- | --- | --- | --- | --- |
| `rbac.permission.registered` | RBAC | SECURITY | Audit, docs generators | Yes | 1 | Published |
| `rbac.permission.deprecated` | RBAC | SECURITY | Audit | Yes | 1 | Published |
| `rbac.role.created` | RBAC | SECURITY | Audit | Yes | 1 | Published |
| `rbac.role.updated` | RBAC | SECURITY | Audit, cache invalidation | Yes | 1 | Published |
| `rbac.role.deleted` | RBAC | SECURITY | Assignment revoke workers, Audit | Yes | 1 | Published |
| `rbac.role_assignment.granted` | RBAC | SECURITY | Audit, Notifications | Yes | 1 | Published |
| `rbac.role_assignment.revoked` | RBAC | SECURITY | Audit | Yes | 1 | Published |
| `rbac.role_assignment.scope_changed` | RBAC | SECURITY | Audit | Yes | 1 | Published |

### Audit

| Event | Owner Module | Classification | Consumers | Replayable | Version | Status |
| --- | --- | --- | --- | --- | --- | --- |
| `audit.record.appended` | Audit | AUDIT | Optional/sampled only | No | 1 | Published |
| `audit.retention.archived` | Audit | AUDIT | Ops | Conditional | 1 | Published |
| `audit.retention.purged` | Audit | AUDIT | Dual-control ops | No | 1 | Published |

### Parties

| Event | Owner Module | Classification | Consumers | Replayable | Version | Status |
| --- | --- | --- | --- | --- | --- | --- |
| `parties.party.created` | Parties | BUSINESS | Audit, search, CRM UX | Yes | 1 | Published |
| `parties.party.updated` | Parties | BUSINESS | Search, cache | Yes | 1 | Published |
| `parties.party.activated` | Parties | BUSINESS | Orders validation | Yes | 1 | Published |
| `parties.party.inactivated` | Parties | BUSINESS | Orders validation | Yes | 1 | Published |
| `parties.party.deleted` | Parties | BUSINESS | Soft refs; block new orders | Yes | 1 | Published |
| `parties.party.merged` | Parties | BUSINESS | Orders remaps, search, Audit | Conditional | 1 | Published |
| `parties.classification.granted` | Parties | BUSINESS | Audit | Yes | 1 | Published |
| `parties.classification.revoked` | Parties | BUSINESS | Audit | Yes | 1 | Published |
| `parties.channel.added` | Parties | BUSINESS | Notifications prefs | Yes | 1 | Published |
| `parties.channel.removed` | Parties | BUSINESS | Notifications prefs | Yes | 1 | Published |
| `parties.relationship.created` | Parties | BUSINESS | CRM graph | Yes | 1 | Published |
| `parties.relationship.removed` | Parties | BUSINESS | CRM graph | Yes | 1 | Published |
| `parties.principal.linked` | Parties | SECURITY | Employee portal, Audit | Yes | 1 | Published |
| `parties.principal.unlinked` | Parties | SECURITY | Audit | Yes | 1 | Published |

### Catalog

| Event | Owner Module | Classification | Consumers | Replayable | Version | Status |
| --- | --- | --- | --- | --- | --- | --- |
| `catalog.item.created` | Catalog | BUSINESS | Audit, search, Inventory seed | Yes | 1 | Published |
| `catalog.item.updated` | Catalog | BUSINESS | Cache, channel sync | Yes | 1 | Published |
| `catalog.item.activated` | Catalog | BUSINESS | Orders assert | Yes | 1 | Published |
| `catalog.item.inactivated` | Catalog | BUSINESS | Orders assert | Yes | 1 | Published |
| `catalog.item.deleted` | Catalog | BUSINESS | Block new lines | Yes | 1 | Published |
| `catalog.variant.created` | Catalog | BUSINESS | Inventory, POS | Yes | 1 | Published |
| `catalog.variant.updated` | Catalog | BUSINESS | Inventory, POS | Yes | 1 | Published |
| `catalog.price.changed` | Catalog | BUSINESS | Channels, Audit, Reporting | Yes | 1 | Published |

### Orders

| Event | Owner Module | Classification | Consumers | Replayable | Version | Status |
| --- | --- | --- | --- | --- | --- | --- |
| `orders.order.created` | Orders | BUSINESS | Audit, product correlation | Yes | 1 | Published |
| `orders.order.updated` | Orders | BUSINESS | Product UX caches | Yes | 1 | Published |
| `orders.order.committed` | Orders | BUSINESS | Inventory, Payments orchestration, Product modules, Audit, Reporting | Yes | 1 | Published |
| `orders.order.partially_fulfilled` | Orders | BUSINESS | Product ops | Yes | 1 | Published |
| `orders.order.fulfilled` | Orders | BUSINESS | Ledger projections (policy), Audit, Reporting | Yes | 1 | Published |
| `orders.order.cancelled` | Orders | BUSINESS | Inventory release, Payments void, Audit, Reporting | Yes | 1 | Published |
| `orders.line.added` | Orders | BUSINESS | Product (draft) | Yes | 1 | Published |
| `orders.line.removed` | Orders | BUSINESS | Product (draft) | Yes | 1 | Published |
| `orders.pricing.finalized` | Orders | BUSINESS | Reporting | Yes | 1 | Published |

> **Note:** `orders.order.committed` is classified **BUSINESS** (commercial SoR fact). Retention for rebuild follows OPERATIONAL minima; when finance policy treats commit as revenue-critical evidence, operators apply **FINANCIAL** cold retention to that type via catalog amendment — without reclassifying Ledger posts.
>
> **Inventory timing ([ADR-0007](../adr/0007-orders-inventory-reservation-and-issue-timing.md)):** `orders.order.committed` → Inventory **reserves** stockable lines; `partially_fulfilled` / `fulfilled` → **issue** fulfilled qty; `cancelled` → **release** unissued reservations. Inventory owns `inventory.stock.reserved` / `reservation.released` / `stock.issued`.

### Inventory

| Event | Owner Module | Classification | Consumers | Replayable | Version | Status |
| --- | --- | --- | --- | --- | --- | --- |
| `inventory.stock_item.created` | Inventory | BUSINESS | Audit, Reporting | Yes | 1 | Planned |
| `inventory.stock.received` | Inventory | BUSINESS | Audit, Ledger (optional), Product, Reporting | Yes | 1 | Published |
| `inventory.stock.issued` | Inventory | BUSINESS | Audit, Product, Reporting | Yes | 1 | Published |
| `inventory.stock.transferred` | Inventory | BUSINESS | Audit, Reporting | Yes | 1 | Planned |
| `inventory.stock.adjusted` | Inventory | BUSINESS | Audit (**mandatory**), Reporting | Yes | 1 | Published |
| `inventory.stock.reserved` | Inventory | BUSINESS | Orders fulfillment aids | Yes | 1 | Published |
| `inventory.stock.released` | Inventory | BUSINESS | Orders fulfillment aids | Yes | 1 | Published |
| `inventory.stock.low` | Inventory | OPERATIONAL | Notifications | Yes | 1 | Planned |

### Payments

| Event | Owner Module | Classification | Consumers | Replayable | Version | Status |
| --- | --- | --- | --- | --- | --- | --- |
| `payments.payment.created` | Payments | FINANCIAL | Audit, Product UX, **Ledger** (S5) | Yes | 1 | Published |
| `payments.payment.authorized` | Payments | FINANCIAL | Audit, Product | Yes | 1 | Published |
| `payments.payment.captured` | Payments | FINANCIAL | **Ledger**, Orders (paid policy), Audit (**mandatory**), Reporting | Conditional | 1 | Published |
| `payments.payment.voided` | Payments | FINANCIAL | Ledger optional reverse, Audit | Conditional | 1 | Published |
| `payments.payment.refunded` | Payments | FINANCIAL | **Ledger**, Orders, Audit (**mandatory**), Reporting | Conditional | 1 | Published |
| `payments.authorization.succeeded` | Payments | FINANCIAL | Audit, Product | Yes | 1 | Planned |
| `payments.authorization.failed` | Payments | FINANCIAL | Audit, Product | Yes | 1 | Planned |
| `payments.capture.succeeded` | Payments | FINANCIAL | **Ledger**, Orders (paid policy), Audit (**mandatory**), Reporting | Conditional | 1 | Planned |
| `payments.capture.failed` | Payments | FINANCIAL | Audit, Product | Yes | 1 | Planned |
| `payments.refund.succeeded` | Payments | FINANCIAL | **Ledger**, Orders, Audit (**mandatory**), Reporting | Conditional | 1 | Planned |
| `payments.refund.failed` | Payments | FINANCIAL | Audit, Product | Yes | 1 | Planned |
| `payments.payment.cancelled` | Payments | FINANCIAL | Ledger optional reverse, Audit | Conditional | 1 | Planned |
| `payments.settlement.updated` | Payments | FINANCIAL | Ops, optional Ledger | Conditional | 1 | Planned |

### Ledger

| Event | Owner Module | Classification | Consumers | Replayable | Version | Status |
| --- | --- | --- | --- | --- | --- | --- |
| `ledger.account.created` | Ledger | FINANCIAL | Audit, Reporting | Yes | 1 | Planned |
| `ledger.account.updated` | Ledger | FINANCIAL | Audit, Reporting | Yes | 1 | Planned |
| `ledger.journal.posted` | Ledger | FINANCIAL | Audit (**mandatory**), Reporting (dashboards only) | Conditional | 1 | Published |
| `ledger.journal.reversed` | Ledger | FINANCIAL | Audit (**mandatory**), Reporting | Conditional | 1 | Published |
| `ledger.balance.changed` | Ledger | FINANCIAL | Cache warmers (optional) | Conditional | 1 | Planned |

> **Ledger protection:** Replaying `ledger.journal.posted` must **not** delete posted journals or truncate books. Corrections are **reversals** ([ADR-0004](../adr/0004-event-retention-replay-rebuild.md)). Reporting may project these events; Ledger remains SoR for disputes.

### Reporting

| Event | Owner Module | Classification | Consumers | Replayable | Version | Status |
| --- | --- | --- | --- | --- | --- | --- |
| `reporting.export.completed` | Reporting | OPERATIONAL | Notifications, Audit | Yes | 1 | Planned |
| `reporting.export.failed` | Reporting | OPERATIONAL | Ops, Audit | Yes | 1 | Planned |
| `reporting.definition.published` | Reporting | OPERATIONAL | Audit | Yes | 1 | Planned |
| `reporting.projection.lag` | Reporting | ANALYTICS | Observability | Yes | 1 | Planned |

### Scheduling

| Event | Owner Module | Classification | Consumers | Replayable | Version | Status |
| --- | --- | --- | --- | --- | --- | --- |
| `scheduling.resource.created` | Scheduling | OPERATIONAL | Audit, Product caches | Yes | 1 | Planned |
| `scheduling.resource.updated` | Scheduling | OPERATIONAL | Audit, Product caches | Yes | 1 | Planned |
| `scheduling.entry.created` | Scheduling | BUSINESS | Product, Notifications, Audit | Yes | 1 | Planned |
| `scheduling.entry.confirmed` | Scheduling | BUSINESS | Product, Notifications | Yes | 1 | Planned |
| `scheduling.entry.cancelled` | Scheduling | BUSINESS | Product workflows, Audit | Yes | 1 | Planned |
| `scheduling.entry.rescheduled` | Scheduling | BUSINESS | Product, Notifications | Yes | 1 | Planned |
| `scheduling.conflict.detected` | Scheduling | OPERATIONAL | Audit/ops | Yes | 1 | Planned |

### Notifications

| Event | Owner Module | Classification | Consumers | Replayable | Version | Status |
| --- | --- | --- | --- | --- | --- | --- |
| `notifications.template.published` | Notifications | OPERATIONAL | Audit | Yes | 1 | Planned |
| `notifications.message.queued` | Notifications | OPERATIONAL | Workers | Yes | 1 | Planned |
| `notifications.message.sent` | Notifications | OPERATIONAL | Audit (optional sample), Product | Yes | 1 | Planned |
| `notifications.message.delivered` | Notifications | OPERATIONAL | Product UX | Yes | 1 | Planned |
| `notifications.message.failed` | Notifications | OPERATIONAL | Audit (**recommended**), ops alerts | Yes | 1 | Planned |
| `notifications.message.bounced` | Notifications | OPERATIONAL | Parties channel invalidation | Yes | 1 | Planned |

---

## Consumer Rules

### Ownership boundaries

1. **Owner module** is the only publisher of its `type` prefix (`identity.*`, `orders.*`, …).  
2. Consumers **never** write the producer’s SoR tables.  
3. Dependency direction remains Product → Shared → Core ([ADR-0001](../adr/0001-platform-technology-foundation.md), [ADR-0002](../adr/0002-domain-map.md)). Event consumption does **not** create reverse package imports.  
4. Kernel: Identity has **no** module deps; Identity / Tenancy / RBAC **must not** import Audit — Audit **consumes** their events ([event-contracts.md](../architecture/event-contracts.md)).  
5. **Payments ↛ Ledger:** Payments does not write `ledger_*`. Ledger (or a host composer using Ledger APIs) consumes `payments.capture.succeeded` / refunds ([ADR-0005](../adr/0005-financial-truth-and-projection-ownership.md)).
6. **Reporting is derived:** Reporting facts never outrank Orders, Payments, Inventory, or Ledger ([ADR-0005](../adr/0005-financial-truth-and-projection-ownership.md)). Default book recognition is capture-driven, not order-commit.

### Allowed consumers

| Pattern | Allowed |
| --- | --- |
| Module B handler on Module A events | If B may depend on A’s **facade/contracts** per domain map, or via `@nbcp/contracts` DTOs only |
| Audit projection | SECURITY / material FINANCIAL / material BUSINESS |
| Reporting projection | BUSINESS / FINANCIAL / selected OPERATIONAL — rebuildable facts only |
| Product modules | Shared commercial events (e.g. kitchen on `orders.order.committed`) |
| Notifications | SECURITY templates + OPERATIONAL / BUSINESS triggers |

### Prohibited dependencies

| Prohibition | Reason |
| --- | --- |
| Identity / Tenancy / RBAC → Audit package | Breaks kernel DAG |
| Payments → Ledger package write path | Ledger owns journals |
| Shared → Product imports | Layering |
| Consumer inventing producer SoR updates “to fix” replay | Violates ownership; use compensating events |
| Treating Reporting fact tables as financial SoR | ADR-0004 / ADR-0005 |
| Bulk-delete Audit rows then “replay to rebuild Audit” | Audit is append-only |

### Event contract responsibilities

| Role | Responsibility |
| --- | --- |
| **Owner** | Define payload schema, emit via outbox, keep catalog row current, own SemVer for the type |
| **Consumer** | Idempotent handlers (`eventId` / business key), tolerate at-least-once, no assumption of sync call |
| **Platform** | Outbox relay, retention/archive, replay tooling per ADR-0004 |
| **Catalog maintainer** | Approve classification + Replayable before first emission |

---

## Versioning Rules

### Backward compatibility

Within a major version (default `Version = 1` without `.vN` suffix):

* **Additive** optional payload fields are allowed.  
* **Required** new fields, removed fields, or changed field semantics require a **new version** (`*.v2`) or new `type`.  
* Consumers must ignore unknown fields (forward compatible readers).

### Event evolution strategy

1. Prefer **new event types** for distinct business facts (`orders.order.committed` vs a future `orders.order.settled`).  
2. Use **`.v{N}`** only when the same fact’s wire shape is incompatible.  
3. Dual-publish during migration windows when breaking.  
4. Update this catalog in the **same change** as the producer contract.

### Deprecation process

1. PR updates catalog: Status → `Deprecated`, document successor, minimum support window (≥ one platform minor, longer for FINANCIAL).  
2. Owners dual-write or translate.  
3. Consumers migrate; fail CI on new deprecated references after grace.  
4. Status → `Retired`; emission removed; cold archive retained per classification.

---

## Governance

### Who may add events

* **Owning module** maintainers propose new `type`s in their domain.  
* Cross-cutting / classification disputes → platform architecture review.  
* Product modules may add **product-prefixed** events (`restaurant.*`, `hotel.*`, …) in product catalogs; those must not collide with Shared/Core prefixes listed here.

### ADR requirements

| Change | Requires |
| --- | --- |
| New publisher module or prefix | Domain map / ADR-0002 amendment if new bounded context |
| Change to outbox/envelope/retention policy | ADR-0003 and/or ADR-0004 |
| Reclassify SECURITY ↔ FINANCIAL or Flip Replayable on money events | ADR-0004 amendment or architecture approval recorded in catalog PR |
| Change default recognition (capture vs commit) or SoR precedence | ADR-0005 amendment |
| Breaking payload for widely consumed FINANCIAL type | Explicit ADR or architecture decision note |

### Review requirements

Catalog PRs must include:

1. Owner module + classification + Replayable + consumers.  
2. Confirmation of DAG / prohibited deps.  
3. Link to module design Event section (or payload DTO path once implemented).  
4. For FINANCIAL / SECURITY: Audit consumer acknowledged.

Suggested reviewers: owning module CODEOWNERS + platform architect for cross-module consumers.

### Catalog maintenance responsibilities

| Party | Duty |
| --- | --- |
| Module owners | Keep design.md and this inventory synchronized |
| Platform architecture | Classification consistency with ADR-0004; resolve conflicts |
| Release engineering | Ensure Status transitions match shipped code |
| Security / compliance | Retention holds for SECURITY / FINANCIAL rows |

**Maintenance rule:** Adding an event to code without a catalog row is a **defect**. Catalog-first or same-PR is required.

---

## Future Work

* **Event schemas** — JSON Schema / TypeScript DTOs per `type` under module `contracts/` or `@nbcp/contracts`, linked from each row.  
* **Contract testing** — consumer-driven tests that fixtures match catalog Version + required fields.  
* **Event registry automation** — generate CI allow-list from this markdown (or future YAML/JSON source of truth) per [ADR-0006](../adr/0006-architecture-enforcement-and-governance.md).  
* **CI validation** — fail PRs that publish unregistered `type`s; fail deprecated references; assert FINANCIAL events are not consumed by Reporting wipe jobs (ADR-0006 gates).  
* **Permission catalog** cross-link — map high-signal events to required `*.read|manage` keys.  
* **Runbooks** — per-classification replay/rebuild procedures bound to Inventory Replayable column.  
* **Product event annex** — separate catalogs for restaurant/hotel/… without polluting this platform inventory.

---

## Document control

| Version | Date | Notes |
| --- | --- | --- |
| 1.0 | 2026-07-14 | Initial catalog; remediates hardening S-02 / P-02; all Status = Planned |
| 1.1 | 2026-07-14 | Identity events Status → Published (WP-02 / `@nbcp/identity`) |
| 1.2 | 2026-07-14 | Tenancy events Status → Published (WP-03 / `@nbcp/tenancy`; expired worker still Planned) |
| 1.3 | 2026-07-14 | RBAC events Status → Published (WP-04 / `@nbcp/rbac`) |
| 1.4 | 2026-07-14 | Audit events Status → Published (WP-05 / `@nbcp/audit`) |
| 1.5 | 2026-07-14 | Parties events Status → Published (S1 / `@nbcp/parties`) |
