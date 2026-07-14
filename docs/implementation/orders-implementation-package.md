# Shared Domain Implementation Package — Orders

**Status:** Implemented — `@nbcp/orders` (S3)  
**Shared milestone:** **S3** ([bootstrap-checklist.md](bootstrap-checklist.md))  
**Layer:** Shared Business ([ADR-0002](../adr/0002-domain-map.md) · [domain-map.md](../architecture/domain-map.md) §5.3)  
**Design authority:** [orders/design.md](../modules/orders/design.md)  
**Prerequisites:** **S1 Parties** · **S2 Catalog** · **[ADR-0007](../adr/0007-orders-inventory-reservation-and-issue-timing.md)** (Orders ↔ Inventory timing)  
**Kernel gate:** [kernel-completion-report.md](../reviews/kernel-completion-report.md)  
**Catalogs:** [event-catalog.md](../reference/event-catalog.md) · [permission-catalog.md](../reference/permission-catalog.md)  
**Policy:** ADR-0001…0007 · [tenant-access-model.md](../architecture/tenant-access-model.md) · [module-standard.md](../architecture/module-standard.md) · [business-capability-map.md](../architecture/business-capability-map.md) · [ADR-0005](../adr/0005-financial-truth-and-projection-ownership.md)  
**Last updated:** 2026-07-14  

This package defines **implementation scope** for the third Shared Domain (Orders). It deliberately omits code, HTTP/API contracts, persistence schemas, and framework choices. Implementers follow ADR-0001 stack decisions in a later implementation PR without contradicting this package, the Orders design, or ADR-0007.

---

## Purpose

**Orders** is NBCP’s **canonical commercial commitment registry**. It is the durable, tenant-owned source of truth for:

* **Commercial intent** (what was ordered, for whom, at what snapshotted prices/quantities)  
* **Order lifecycle** (draft → committed → fulfilled / cancelled, with optional partial fulfillment)  
* **Order lines** (catalog refs + quantities + pricing snapshots)  
* **Customer references** (`customerPartyId` → Parties)  
* **Catalog references** (`catalogItemId` / optional `variantId`)  
* **Fulfillment requests** (fulfill / partial-fulfill transitions that *signal* downstream Inventory — Orders does not mutate stock)

Orders is **not** the source of truth for:

* **Inventory balances** / reservations / issues ([ADR-0007](../adr/0007-orders-inventory-reservation-and-issue-timing.md))  
* **Payments** (intents, capture, refund)  
* **Ledger** entries / balances ([ADR-0005](../adr/0005-financial-truth-and-projection-ownership.md))  
* **Reporting** projections  

**Sequencing:** S3 may start only after S1, S2, and ADR-0007. Inventory (S6) and Payments (S4) consume Orders events later — Orders must **never** import Inventory, Payments, Ledger, or Reporting.

---

## Responsibilities

### What Orders owns

| Ownership | Description |
| --- | --- |
| **Order aggregate** | Tenant-scoped commercial documents: header, lines, adjustments, lifecycle status |
| **Commercial intent** | Accepted quantities and snapshotted commercial amounts once committed |
| **Order lines** | Catalog refs, qty, line pricing snapshot, line totals |
| **Customer reference** | Opaque `customerPartyId` (Parties); usability asserted at set/commit |
| **Catalog references** | Opaque `catalogItemId` / `variantId`; orderability asserted via Catalog facade |
| **Pricing snapshots** | Freeze name/code/unit price/tax inputs at **commit** (normative per design) |
| **Fulfillment state** | `partially_fulfilled` / `fulfilled` and fulfilled quantity progress — commercial/ops signal only |
| **Cancel / return relation** | Cancel transitions; optional related return/credit orders (neutral `OrderType`) |
| **Producer events** | Orders `orders.*` types published via transactional outbox |
| **Authorization surface** | Tenancy context + RBAC Orders permission keys |

### What Orders does **not** own

| Non-ownership | Belongs to |
| --- | --- |
| On-hand, reserved qty, stock movements | **Inventory** (reacts to Orders events per ADR-0007) |
| Payment intents / capture / refund | **Payments** |
| Posted journals / balances | **Ledger** |
| Analytics marts / rebuildable facts | **Reporting** |
| Party master data | **Parties** (Orders stores `partyId` only) |
| Offering definitions / list-price SoR | **Catalog** (Orders snapshots commercial terms) |
| Login / sessions | **Identity** |
| Org / membership | **Tenancy** |
| Permission evaluation | **RBAC** |
| Append-only audit store | **Audit** |
| Table / room / kitchen / encounter / enrollment | **Product** modules referencing `orderId` |

### Non-goals

* Vertical Core fields (`tableId`, `roomId`, patient/student columns) — product satellites + `externalRef` / `channel`  
* Writing Inventory tables or calling Inventory APIs from inside `@nbcp/orders`  
* Implementing Payments or Ledger in S3  
* Treating `orders.order.committed` as default revenue recognition ([ADR-0005](../adr/0005-financial-truth-and-projection-ownership.md))  

---

## Core Concepts

### Order

Canonical **aggregate root** for a commercial commitment within a tenant (`organizationId`).

| Aspect | Rule |
| --- | --- |
| **Identity** | Opaque `orderId` referenced by Products, Payments, Inventory, Ledger dims |
| **Scope** | Optional `locationId` (place of sale / service — Tenancy-validated) |
| **Customer** | `customerPartyId` (default required; anonymous/guest only via explicit future policy) |
| **Type** | Neutral `sale` \| `return` \| `credit` — not industry-specific |
| **Opaque correlation** | `channel` / `externalRef` for product workflows (not interpreted by Orders domain logic) |

### Order Line

Entity under Order: quantity of a catalog offering at a **pricing snapshot**.

| Aspect | Rule |
| --- | --- |
| **Refs** | `catalogItemId`, optional `variantId` |
| **Quantity** | Positive qty under module policy |
| **Snapshot** | Finalized at commit: catalog name/code, unit price, tax fields as designed |
| **Immutability** | After commit, lines are not arbitrarily edited; fulfillment qty progress is separate |

### Customer Reference

Opaque Parties `partyId` on the order header. Orders calls Parties `assertPartyUsable` (or equivalent) when setting/changing customer and at commit — does **not** duplicate Party SoR.

### Catalog Reference

Opaque Catalog ids on lines. At add (draft) and/or commit, Orders calls Catalog `assertItemOrderable` (and resolves list price inputs for snapshot). Live Catalog price changes after commit **must not** mutate frozen snapshots.

### Fulfillment

Commercial/ops progress that quantity has been fulfilled (shipped, served, delivered — product-defined meaning). Orders records fulfill transitions and emits events; **Inventory issues stock** in reaction ([ADR-0007](../adr/0007-orders-inventory-reservation-and-issue-timing.md)). Orders never decrements on-hand.

### Order Status

Lifecycle status of the Order aggregate (see State Machine). Distinct from payment status, inventory reservation status, and ledger posting status.

---

## State Machine

Platform statuses for S3 (design-aligned):

| Status | Meaning |
| --- | --- |
| `draft` | Editable commercial intent; not firm |
| `committed` | Accepted commercial commitment; drives Inventory reserve + Payments orchestration |
| `partially_fulfilled` | Optional intermediate — some line qty fulfilled |
| `fulfilled` | Completely fulfilled |
| `cancelled` | Voided; Inventory releases unissued reservations |

### Valid transitions

```text
draft ──────────────────────────────► cancelled
  │
  ▼
committed ──► partially_fulfilled ──► fulfilled
  │                    │
  ├────────────────────┴────────────► cancelled
  └──► fulfilled
```

| From | To | Notes |
| --- | --- | --- |
| `draft` | `committed` | Finalize snapshots; emit `orders.order.committed` (+ `orders.pricing.finalized`) |
| `draft` | `cancelled` | Discard; typically no Inventory effect |
| `committed` | `partially_fulfilled` | Fulfill some qty; emit `orders.order.partially_fulfilled` |
| `committed` | `fulfilled` | Complete fulfill in one step |
| `committed` | `cancelled` | Emit `orders.order.cancelled` → Inventory release |
| `partially_fulfilled` | `fulfilled` | Complete remaining |
| `partially_fulfilled` | `cancelled` | Cancel remainder; Inventory releases unissued reserve |
| `fulfilled` | — | Terminal for normal sales path (returns = related new order) |
| `cancelled` | — | Terminal |

**Forbidden:** editing lines after commit (except explicit controlled use cases deferred from S3 minimum); inventing `paid` / `posted` statuses inside Orders.

---

## Inventory Interaction

Normative: **[ADR-0007](../adr/0007-orders-inventory-reservation-and-issue-timing.md)**.

Orders **publishes lifecycle facts**; Inventory (or host composer + Inventory APIs) **owns stock effects**. `@nbcp/orders` must **not** import Inventory.

| Orders moment | Inventory effect (Inventory-owned) | Orders responsibility |
| --- | --- | --- |
| **Commit** | **Reserve** stockable lines | Emit `orders.order.committed` with line summaries (catalogItemId, variantId?, qty, location) |
| **Fulfillment** (partial or complete) | **Issue** fulfilled qty against reservation | Emit `partially_fulfilled` / `fulfilled` with **per-line fulfilled qty** for idempotency |
| **Cancel** | **Release** unissued reservations | Emit `orders.order.cancelled` |

### Ownership boundaries

* Orders does **not** store on-hand or reserved balances.  
* Hard overselling pre-check (when required) is **host/product composer** calling Inventory availability/reserve **before** `commitOrder` — not Orders → Inventory.  
* Non-stockable / service lines: no Inventory effect (Catalog stockable trait).  
* Already-issued stock on cancel: compensating movements in Inventory — not Orders inventing restock.

S3 acceptance does **not** require Inventory module to be implemented; it requires Orders events to be **ADR-0007-ready** (payloads Inventory can consume later).

---

## Payments Interaction

**Future integration points only — no Payments implementation in S3.**

| Integration point | Direction | Intent |
| --- | --- | --- |
| `orderId` as payable reference | Payments → Orders (ref) | Intents/captures reference commercial commitment |
| `orders.order.committed` | Payments / orchestrator may consume | Create payment intent against firm order |
| `orders.order.cancelled` | Payments may consume | Void/cancel open intents (Payments policy) |
| Capture success | **Does not** change Orders status by default | Paid vs fulfilled remain separate; product/composer may gate fulfill-after-pay |

Orders must **not** import Payments; must **not** embed card/PSP data; must **not** treat payment capture as commit or issue timing ([ADR-0007](../adr/0007-orders-inventory-reservation-and-issue-timing.md)).

---

## Ledger Interaction

**Future integration points only — no Ledger implementation in S3.**

| Integration point | Direction | Intent |
| --- | --- | --- |
| `orderId` dimension on journals | Ledger references Orders | Books cite commercial document |
| `orders.order.fulfilled` (policy) | Optional Ledger consumer | Some templates recognize on fulfill — **not** platform default on commit ([ADR-0005](../adr/0005-financial-truth-and-projection-ownership.md)) |
| `orders.order.committed` | Reporting operational sales OK | **Not** default revenue journal |

Orders must **not** import Ledger or post journals. Commit ≠ books by default.

---

## Events

Authoritative inventory: [event-catalog.md](../reference/event-catalog.md) § Orders. Rows are **Planned** until first emit; Status → **Published** in the same change set as the producer (ADR-0006).

### Orders-defined Orders events

| Event `type` | Classification | Replayable | Notes |
| --- | --- | --- | --- |
| `orders.order.created` | BUSINESS | Yes | Draft created |
| `orders.order.updated` | BUSINESS | Yes | Draft changed |
| `orders.order.committed` | BUSINESS | Yes | **Inventory reserve** trigger (ADR-0007); Payments orchestration |
| `orders.order.partially_fulfilled` | BUSINESS | Yes | **Inventory issue** (fulfilled qty) |
| `orders.order.fulfilled` | BUSINESS | Yes | **Inventory issue** residual; optional Ledger policy |
| `orders.order.cancelled` | BUSINESS | Yes | **Inventory release**; Payments void flows |
| `orders.line.added` | BUSINESS | Yes | Draft granularity (optional emit) |
| `orders.line.removed` | BUSINESS | Yes | Draft granularity (optional emit) |
| `orders.pricing.finalized` | BUSINESS | Yes | On commit — Reporting operational |

### Ownership

* **Owner module:** Orders only.  
* **Prefix:** `orders.` — no other module may publish these types.  
* **Envelope:** ADR-0003 fields required; **`organizationId` always set**.

### Publication rules

1. Persist order mutation and outbox append in the **same unit of work** ([ADR-0003](../adr/0003-event-contracts-and-outbox.md), [ADR-0006](../adr/0006-architecture-enforcement-and-governance.md)).  
2. Material lifecycle types (`committed`, `cancelled`, fulfill events) are **outbox-required**.  
3. Do not publish types absent from the event catalog.  
4. Breaking payload changes require catalog Versioning Rules.  
5. Commit/cancel payloads must include line summaries sufficient for Inventory idempotency (ADR-0007 follow-up).  
6. Prefer Audit via outbox projection; Shared may call Audit `record`.  

### Replay expectations

| Class | Expectation |
| --- | --- |
| BUSINESS (Replayable = Yes) | Idempotent consumers on `eventId`; Inventory reserve/issue/release must not double-apply |
| Commit / fulfill / cancel | Must not invent Ledger journals from Orders alone (ADR-0005) |
| Reporting rebuild | May rebuild sales facts from these events; must not wipe Orders SoR ([ADR-0004](../adr/0004-event-retention-replay-rebuild.md)) |

Orders SoR is **not** rebuilt by Reporting wipe+replay. Events support Inventory, Payments, Product, Audit, and Reporting consumers.

---

## Permissions

Authoritative keys: [permission-catalog.md](../reference/permission-catalog.md) § Orders.

| Permission key | Intent | Typical roles (catalog legend) |
| --- | --- | --- |
| `orders.order.read` | View orders | org admin, location manager, staff, auditor, finance operator |
| `orders.order.manage` | Create/edit draft orders | org admin, location manager, staff |
| `orders.order.commit` | Commit drafts | org admin, location manager, staff |
| `orders.order.fulfill` | Mark fulfill / partial fulfill | org admin, location manager, staff |
| `orders.order.cancel` | Cancel orders | org admin, location manager |

### Permission rules for S3

1. Keys **registered** into RBAC registry — ⊆ permission catalog.  
2. Host calls RBAC `authorize` before use cases (`manage` vs `commit` vs `fulfill` vs `cancel` as distinct grants).  
3. Bind into intended roles (at minimum extend `organization.administrator`).  
4. No owner permission bypass of RBAC.  

---

## Dependencies

### Allowed

| Dependency | Usage |
| --- | --- |
| **`@nbcp/outbox`** | Transactional publication of Orders events |
| **Identity** | Optional actor/principal for authorize context |
| **Tenancy** | `organizationId`, optional `locationId`, membership for authorize |
| **RBAC** | `authorize` for Orders permission keys |
| **Audit** | Event consumption and/or Shared-allowed `record` |
| **Parties** | `customerPartyId` validation / `assertPartyUsable` |
| **Catalog** | `assertItemOrderable`, price inputs for snapshots |

Direction: **Orders → Core/Audit/Parties/Catalog**; never reverse (Parties/Catalog/Core must not import Orders).

### Forbidden

| Dependency | Reason |
| --- | --- |
| **Payments** | Settlement SoR separate; future consumers only |
| **Ledger** | Books separate (ADR-0005); Orders ↛ Ledger |
| **Inventory** | Stock SoR separate; Inventory reacts to events (ADR-0007); Orders ↛ Inventory |
| **Reporting** | Analytics must not become Orders dependency |
| **Product modules** | Shared ↛ Product (ADR-0002 / ADR-0006) |

### Package / import governance

* Public facade only — no deep Core/Parties/Catalog internals.  
* Architecture enforcement must fail Orders → Payments|Ledger|Inventory|Reporting and Shared → Product.  
* New `orders.*` event/permission strings require catalog updates in the same PR as first use.  
* Extend `@nbcp/architecture-enforcement` SHARED_PACKAGE_POLICY when `@nbcp/orders` lands (allow Parties + Catalog; forbid Inventory).  

---

## Acceptance Criteria

Objective signals for Orders S3 (checklist S3: *Commit/cancel path; outbox on material events*):

| # | Criterion | Objective signal |
| --- | --- | --- |
| AC-1 | Draft order + lines | Create draft; add/remove lines with catalog refs within tenant |
| AC-2 | Customer reference | Set `customerPartyId`; Parties assert on commit; invalid party rejected |
| AC-3 | Catalog reference / orderability | Commit fails if Catalog `assertItemOrderable` fails |
| AC-4 | Commit + pricing snapshot | Commit freezes snapshots; later Catalog price change does not alter line snapshots |
| AC-5 | State machine | Valid transitions only; invalid transitions rejected |
| AC-6 | Cancel path | Cancel draft or committed; emit `orders.order.cancelled` |
| AC-7 | Fulfillment path | Partial and/or complete fulfill; emit fulfill events with line qty |
| AC-8 | ADR-0007-ready payloads | Commit/fulfill/cancel events include organizationId + line summaries Inventory needs |
| AC-9 | Tenant isolation | No cross-tenant get/find |
| AC-10 | Orders events published | Declared `orders.*` ⊆ event catalog; outbox same UoW |
| AC-11 | Permissions seeded | Orders keys registered; deny-by-default without grant |
| AC-12 | Dependency DAG | Only allow-listed deps; fail Payments/Ledger/Inventory/Reporting imports |
| AC-13 | Catalog Status | Emitted Orders types marked **Published** when first shipped |
| AC-14 | No vertical leakage | No table/room/patient/student/kitchen types or required columns |
| AC-15 | No money-path coupling | No Payments/Ledger imports or payment/journal side effects in Orders |

**S3 minimum:** Draft + lines + commit (snapshots) + cancel + fulfill (at least complete; partial recommended) + outbox events + permissions + Parties/Catalog asserts + tenant isolation. Return orders / adjustments may be residual with architect approval. Inventory/Payments/Ledger modules are **out of scope** for S3 code.

---

## Testing Strategy

### Domain tests

* Lifecycle transition matrix (allowed / forbidden)  
* Snapshot immutability after commit  
* Totals invariants (currency consistency, non-negative qty policy)  
* Terminal-state mutation rejection  

### Integration tests

* Create draft → add lines → commit → outbox `committed` + `pricing.finalized`  
* Cancel committed → `cancelled` in outbox  
* Fulfill → `fulfilled` / `partially_fulfilled` with line qty  
* Parties unusable / Catalog not orderable → commit denied  
* RBAC: without `orders.order.commit`, commit denied; with grant, allowed  
* UoW rollback → no order mutation and no outbox row  
* Cross-tenant get returns null / denied  

### Architecture tests

* Package allow-list: Outbox, Identity, Tenancy, RBAC, Audit, Parties, Catalog  
* Forbidden: Payments, Ledger, Inventory, Reporting, Product  
* Declared `orders.*` ⊆ event catalog; permission seeds ⊆ permission catalog  
* Core / Parties / Catalog remain free of reverse Orders dependency  

---

## Definition of Done — Shared Domain Milestone S3

S3 is **complete** when all of the following are true:

1. **Facade delivered** — Orders public application facade covers create draft, manage lines, commit (snapshots), cancel, fulfill (partial and/or complete), and tenant-scoped get/find.  
2. **Events live** — Emitted `orders.*` types published via `@nbcp/outbox`; Status → **Published** for those types; commit/fulfill/cancel payloads ADR-0007-ready.  
3. **Permissions seeded** — Orders permission keys in RBAC registry and enforceable.  
4. **Acceptance criteria AC-1…AC-15** evidenced by automated tests (deferred items residual-tracked with architect approval).  
5. **Architecture / CI** — `@nbcp/orders` green under `pnpm enforce:architecture` and module architecture suite; **no** Orders → Inventory|Payments|Ledger|Reporting.  
6. **Documentation** — `modules/orders` README + CHANGELOG; design status → implemented; this package marked Implemented with package path.  
7. **Prior gates intact** — S1, S2, M6, and ADR-0007 remain authoritative and green.  

**Exit after S3:** Payments (S4) and Inventory (S6) may consume Orders events; Ledger remains ADR-0005-gated. Orders must not grow forbidden dependencies to “finish” stock or payment stories.

---

## Sequencing Reminder

```text
M6 Kernel Complete
  → S1 Parties      (complete)
  → S2 Catalog      (complete)
  → ADR-0007        (accepted — reserve @ commit, issue @ fulfill)
  → S3 Orders       ← this package
  → S4 Payments / S5 Ledger (ADR-0005; Payments ↛ Ledger writes)
  → S6 Inventory    (consumes Orders events per ADR-0007)
```

Do not implement Inventory, Payments, or Ledger inside this package. Do not add vertical Ops fields to the Order aggregate.

---

## Document control

| Version | Date | Notes |
| --- | --- | --- |
| 1.0 | 2026-07-14 | Initial Orders implementation package for Shared S3 — documentation only |
| 1.1 | 2026-07-14 | Marked Implemented — `@nbcp/orders` delivered |
