# Shared Domain Implementation Package — Catalog

**Status:** Implemented — `@nbcp/catalog` (S2)  
**Shared milestone:** **S2** ([bootstrap-checklist.md](bootstrap-checklist.md))  
**Layer:** Shared Business ([ADR-0002](../adr/0002-domain-map.md) · [domain-map.md](../architecture/domain-map.md) §5.2)  
**Design authority:** [catalog/design.md](../modules/catalog/design.md)  
**Prerequisite:** **S1 Parties** — [parties-implementation-package.md](parties-implementation-package.md) (`@nbcp/parties`)  
**Kernel gate:** [kernel-completion-report.md](../reviews/kernel-completion-report.md)  
**Catalogs:** [event-catalog.md](../reference/event-catalog.md) · [permission-catalog.md](../reference/permission-catalog.md)  
**Policy:** ADR-0001…0006 · [tenant-access-model.md](../architecture/tenant-access-model.md) · [module-standard.md](../architecture/module-standard.md) · [business-capability-map.md](../architecture/business-capability-map.md)  
**Last updated:** 2026-07-14  

This package defines **implementation scope** for the second Shared Domain (Catalog). It deliberately omits code, HTTP/API contracts, persistence schemas, and framework choices. Implementers follow ADR-0001 stack decisions in a later implementation PR without contradicting this package or the Catalog design.

---

## Purpose

**Catalog** is NBCP’s **canonical commercial offering registry**. It is the durable, tenant-owned source of truth for:

* **Products** (physical / goods offerings — as catalog items with goods traits, not a separate Product module)  
* **Services** (performed offerings — as catalog items with service traits)  
* **Catalog items** (the aggregate root every vertical references)  
* **Pricing metadata** (list prices at item and/or variant level)  
* **Availability metadata** (orderable / inactive / location applicability — not on-hand stock)  
* **Catalog lifecycle** (draft → active → inactive / deleted)

Downstream Shared and Product modules **reference `catalogItemId` (and optional `variantId`) only**. They must not invent parallel SKU/menu/course SoRs inside Catalog.

**Sequencing:** S2 may start only after S1. Optional supplier references use Parties (`supplierPartyId`). Orders (S3) will depend on Catalog — Catalog must **not** depend on Orders.

---

## Responsibilities

### What Catalog owns

| Ownership | Description |
| --- | --- |
| **Catalog item master data** | Tenant-scoped offering definitions: code/SKU, names, description, traits/kinds |
| **Variants** | Sellable variations under an item (size, duration tier, options) |
| **List pricing** | Default commercial price metadata (`Money`: currency + amountMinor; optional validity window) |
| **Tax category association** | Tax class reference on items (and tax category registry when in scope) |
| **Availability / sellability flags** | Whether an item is orderable for **new** lines; optional location applicability |
| **Item lifecycle status** | `draft` \| `active` \| `inactive` \| `deleted` |
| **Optional supplier link** | Soft reference to a Parties `partyId` (supplier classification expected by convention) |
| **Producer events** | Catalog `catalog.*` types published via transactional outbox |
| **Authorization surface** | Mutations/queries require Tenancy context + RBAC using Catalog permission keys |

### What Catalog does **not** own

| Non-ownership | Belongs to |
| --- | --- |
| On-hand quantity, reservations, stock movements | **Inventory** |
| Order headers/lines, commit/fulfill | **Orders** |
| Payment intents / capture / refund | **Payments** |
| Posted journals / balances | **Ledger** |
| Analytics marts / rebuildable reporting facts | **Reporting** |
| Party/customer/supplier master data | **Parties** (Catalog may only store `partyId` refs) |
| Login, sessions, credentials | **Identity** |
| Tenant org / membership | **Tenancy** |
| Permission evaluation | **RBAC** |
| Append-only audit store | **Audit** (Catalog emits; Audit projects / Shared may `record`) |
| Menu layout, room instances, patient protocols, SIS courses | **Product** modules composing over `catalogItemId` |

### Non-goals

* Elevating MenuItem, Room, PatientService, or Course to Catalog aggregates ([design §2](../modules/catalog/design.md))  
* Industry-required columns (floor number, credits, kitchen allergy notes) on CatalogItem — use `metadata` / product satellites keyed by `catalogItemId`  
* Becoming a channel pricing engine beyond list price (channel overrides may appear later without moving SoR ownership)  
* Writing Inventory or Orders tables from Catalog  

---

## Core Concepts

### Product

Stakeholder “product” means a **sellable commercial offering** represented as a **CatalogItem** with goods-oriented traits (e.g. `goods`, typically `stockable` when Inventory will track quantity).

**Not** a separate Shared aggregate or `products` domain module (that name is reserved for vertical composition packages under `products/`).

### Service

A CatalogItem with **service** (and related) traits — performed work or billable service definitions. Still a CatalogItem; no `Service` AR. Clinical protocols, appointment slots, and classroom sections remain outside Catalog.

### Catalog Item

Canonical **aggregate root** for an offering definition within a tenant (`organizationId`).

| Aspect | Rule |
| --- | --- |
| **Identity** | Opaque `catalogItemId`; optional tenant-unique `code` / SKU |
| **Traits** | Composable flags/kinds: `goods`, `service`, `membership`, `bookable_offering`, `education_offering`, `healthcare_offering`, … |
| **Variants** | Zero or more variants; variant codes unique within item |
| **Reference rule** | Orders, Inventory, Product UIs store `catalogItemId` / `variantId` — not denormalized item SoRs |

### Price

**List price** metadata owned by Catalog: amount + currency (minor units), optionally scoped to item or variant, optionally time-bounded (`validFrom` / `validTo`).

Emits `catalog.price.changed` on material change. Does **not** own capture amounts, tax computation engines, or ledger postings.

### Availability Status

Sellability / applicability metadata — **not** stock on hand:

| Signal | Meaning |
| --- | --- |
| Item/variant **active** + orderable | May appear on **new** order lines (subject to location applicability) |
| **Inactive** / **deleted** | Must not be added to new order lines (`assertItemOrderable` fails) |
| **Location applicability** | Optional allowlist of Tenancy `locationId`s; empty ⇒ all locations in tenant |
| **Stockable trait** | Inventory *may* track quantity; Catalog never stores qty |

### Catalog Status

Lifecycle status of a CatalogItem (and similarly variant retirement where applicable):

| Status | Meaning |
| --- | --- |
| `draft` | Incomplete; typically not orderable |
| `active` | Normal commercial use |
| `inactive` | Retained; disabled for **new** order lines |
| `deleted` | Soft-deleted; historical refs remain valid |

Status transitions emit corresponding catalog events (`activated`, `inactivated`, `deleted`).

---

## Events

Authoritative inventory: [event-catalog.md](../reference/event-catalog.md) § Catalog. All rows are **Planned** until first emit; Status must move to **Published** in the same change set as the producer (ADR-0006).

### Catalog-defined Catalog events

| Event `type` | Classification | Replayable | Notes |
| --- | --- | --- | --- |
| `catalog.item.created` | BUSINESS | Yes | Master create |
| `catalog.item.updated` | BUSINESS | Yes | Profile / trait / field changes |
| `catalog.item.activated` | BUSINESS | Yes | Lifecycle — Orders assert |
| `catalog.item.inactivated` | BUSINESS | Yes | Lifecycle — Orders assert |
| `catalog.item.deleted` | BUSINESS | Yes | Soft delete — block new lines |
| `catalog.variant.created` | BUSINESS | Yes | Variant under item |
| `catalog.variant.updated` | BUSINESS | Yes | Variant change |
| `catalog.price.changed` | BUSINESS | Yes | List price change |

### Ownership

* **Owner module:** Catalog only.  
* **Prefix:** `catalog.` — no other module may publish these types.  
* **Envelope:** ADR-0003 fields required; **`organizationId` always set**.

### Publication rules

1. Persist catalog aggregate mutation and outbox append in the **same unit of work** ([ADR-0003](../adr/0003-event-contracts-and-outbox.md), [ADR-0006](../adr/0006-architecture-enforcement-and-governance.md)).  
2. Material **BUSINESS** master-data types in this table are **outbox-required** (Orders, Inventory seed, search, Audit consumers).  
3. Do not publish types absent from the event catalog.  
4. Breaking payload changes require catalog Versioning Rules (`.vN` or new type).  
5. Prefer Audit via outbox projection; Shared **may** call Audit `record` from application layer.  
6. Wire `type` strings must satisfy the platform event naming pattern (module.resource.past_tense — typically three or more segments).

### Replay expectations

| Class | Expectation |
| --- | --- |
| BUSINESS (Replayable = Yes) | Idempotent consumers on `eventId`; safe for search/cache rebuild, Inventory seeders, Audit backfill |
| Price / activate events | Consumers must not invent financial journals from Catalog alone (ADR-0005) |

Catalog SoR is **not** rebuilt by wiping tables and replaying as if Reporting. Events support projections and integrations; Catalog tables remain the business SoR for offering truth.

---

## Permissions

Authoritative keys: [permission-catalog.md](../reference/permission-catalog.md) § Catalog.

| Permission key | Intent | Typical roles (catalog legend) |
| --- | --- | --- |
| `catalog.item.read` | View items, variants, prices | org admin, location manager, staff |
| `catalog.item.manage` | Create/update/lifecycle items, variants, prices | org admin, location manager |
| `catalog.tax.manage` | Manage tax categories | org admin, finance operator |

### Permission rules for S2

1. Keys must be **registered** into the RBAC permission registry — ⊆ permission catalog (no invented keys).  
2. Host/application layer calls RBAC `authorize` before mutating/query use cases.  
3. Tax category mutations use `catalog.tax.manage` when tax registry APIs are in S2 scope; otherwise defer tax registry with residual ticket while still allowing `taxCategoryId` refs if seeded.  
4. Bind keys into intended roles (at minimum extend `organization.administrator`) without owner permission bypass.  

---

## Dependencies

### Allowed

| Dependency | Usage |
| --- | --- |
| **`@nbcp/outbox`** | Transactional publication of catalog events |
| **Identity** (facade) | Optional actor/principal resolution if host passes principal for authorize |
| **Tenancy** (facade) | Tenant `organizationId`; location applicability validation |
| **RBAC** (facade) | `authorize` for Catalog permission keys |
| **Audit** | Event consumption and/or Shared-allowed `record` |
| **Parties** (facade) | Optional validate `supplierPartyId` on link |

Direction: **Catalog → Core/Audit/Parties**; never reverse (Identity / Tenancy / RBAC / Parties packages must not import Catalog).

### Forbidden

| Dependency | Reason |
| --- | --- |
| **Orders** | Orders will depend on Catalog — not the reverse |
| **Payments** | Money path must not enter Catalog |
| **Ledger** | Financial SoR isolation (ADR-0005) |
| **Inventory** | Stock truth ≠ offering definition; Inventory depends on Catalog |
| **Reporting** | Analytics must not become Catalog SoR dependency |
| **Product modules** | Shared must not depend on Product (ADR-0002 / ADR-0006) |

### Package / import governance

* Public facade only — no deep imports of Core/Parties internals.  
* Architecture enforcement must fail Catalog → Orders|Payments|Ledger|Inventory|Reporting and Shared → Product edges.  
* New `catalog.*` event/permission strings require catalog updates in the same PR as first use.  
* Extend `@nbcp/architecture-enforcement` Shared package policy when the package lands (mirror Parties S1).  

---

## Acceptance Criteria

Objective signals for Catalog S2 (checklist S2: *Items/prices; events catalogued*):

| # | Criterion | Objective signal |
| --- | --- | --- |
| AC-1 | Catalog items exist for goods and services | Create items with goods and service traits; get within tenant |
| AC-2 | Variants supported | Add/update variant under item; uniqueness within item |
| AC-3 | List prices owned by Catalog | Set/change price; `catalog.price.changed` in outbox |
| AC-4 | Availability / lifecycle enforced | Activate/inactivate/delete; inactive/deleted fail orderability assert |
| AC-5 | Location applicability (if in S2 scope) | Restrict / clear location allowlist; queries respect filter |
| AC-6 | Tenant isolation | All commands/queries require `organizationId`; no cross-tenant access |
| AC-7 | Optional supplier Party ref | Link validates Parties facade; no Party SoR duplication |
| AC-8 | Catalog events published | Declared `catalog.*` types ⊆ event catalog; outbox in same UoW |
| AC-9 | Permissions seeded | Catalog permission keys registered; deny-by-default without grant |
| AC-10 | Dependency DAG | Only allow-listed deps; architecture tests fail forbidden edges |
| AC-11 | Catalog Status | Emitted Catalog event types marked **Published** when first shipped |
| AC-12 | No vertical leakage | No Menu/Room/Course/PatientService aggregates or required industry columns |

**S2 minimum:** Items + variants + list price + lifecycle + outbox events + permissions + tenant isolation. Tax category **registry** and location applicability may be residual if called out with architect approval, but `assertItemOrderable` behavior for inactive/deleted is **not** residual.

---

## Testing Strategy

### Domain tests

* Invariants: tenant ownership, code uniqueness, variant uniqueness within item, status transitions, trait flags  
* Orderability rules for inactive/deleted (/draft policy)  
* Price money invariants (currency, non-negative amountMinor per design)  

### Integration tests

* Create goods and service items; add variant; set list price; activate  
* Outbox rows for create/update/activate/price.changed after commit  
* RBAC: without `catalog.item.manage`, mutations denied; with admin grant, allowed  
* Optional supplierPartyId link against Parties  
* Rollback of UoW leaves no item change and no outbox row  
* `assertItemOrderable` fails for inactive/deleted  

### Architecture tests

* Package dependency allow-list (Outbox, Identity, Tenancy, RBAC, Audit, Parties)  
* Forbidden imports of Orders / Payments / Ledger / Inventory / Reporting / Product  
* No deep Core/Parties internals imports  
* Declared `catalog.*` event types ⊆ event catalog  
* Catalog permission seeds ⊆ permission catalog  
* Core and Parties remain free of Catalog reverse dependency  

---

## Definition of Done — Shared Domain Milestone S2

S2 is **complete** when all of the following are true:

1. **Facade delivered** — Catalog public application facade covers item create/update, variants, list prices, lifecycle, and orderability assert (location applicability / tax registry included or residual-tracked).  
2. **Events live** — Catalog event types the facade emits are published through `@nbcp/outbox` with correct ownership; Status → **Published** for those types.  
3. **Permissions seeded** — Catalog permission keys exist in RBAC registry and are enforceable via authorize.  
4. **Acceptance criteria AC-1…AC-12** evidenced by automated tests (any deferred AC called out with residual ticket and architect approval).  
5. **Architecture / CI** — Catalog package green under `pnpm enforce:architecture` and module architecture suite; no reverse Catalog edges into Core/Parties.  
6. **Documentation** — `modules/catalog` README + CHANGELOG; design status updated to implemented; this package marked Implemented with package path.  
7. **Prior gates intact** — S1 Parties and M6 enforcement remain green.  

**Exit to Orders (S3):** S2 green. Orders may reference Parties + Catalog facades for commercial lines; Orders must not write Catalog tables.

---

## Sequencing Reminder

```text
M6 Kernel Complete
  → S1 Parties     (complete)
  → S2 Catalog     ← this package
  → S3 Orders
  → S4 Payments / S5 Ledger (ADR-0005; Payments ↛ Ledger writes)
```

Do not open Payments, Ledger, or Inventory from this package. Do not implement vertical menus/rooms/courses inside Catalog.

---

## Document control

| Version | Date | Notes |
| --- | --- | --- |
| 1.0 | 2026-07-14 | Initial Catalog implementation package for Shared S2 — documentation only |
| 1.1 | 2026-07-14 | Marked Implemented — `@nbcp/catalog` delivered |
