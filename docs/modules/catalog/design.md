# Catalog Module — Design

| Field | Value |
| --- | --- |
| **Module** | `catalog` (`modules/catalog` — `@nbcp/catalog`) |
| **Layer** | Shared Business ([ADR-0002](../../adr/0002-domain-map.md)) |
| **Stack** | NestJS + Prisma ([ADR-0001](../../adr/0001-platform-technology-foundation.md)) |
| **Structure** | [Module standard](../../architecture/module-standard.md) |
| **Status** | Implemented (S2) — domain facade + in-memory kernel; Nest/Prisma host wiring later |
| **Last updated** | 2026-07-14 |

**Normative companions:** [Business capability map](../../architecture/business-capability-map.md) · [Parties design](../parties/design.md) · [Event contracts / ADR-0003](../../architecture/event-contracts.md) · [Tenant access model](../../architecture/tenant-access-model.md)

---

## 1. Purpose

The **Catalog** module is NBCP’s **canonical commercial offering registry**: tenant-owned definitions of what can be sold, stocked, booked as a sellable offering, or included on orders — across all verticals.

It answers: *What is this offering (good, service, membership, bookable offering, educational offering, healthcare offering), how is it identified, priced at list level, and is it available to sell?*

It does **not** answer: *How is it presented on a menu, which physical room is #412, what is the clinical protocol, or which term/section is Fall MATH-101?* Those are **product compositions** over catalog items (and sometimes Scheduling / Inventory).

### Must support (as generic kinds / traits — not industry aggregates)

| Need | Catalog representation |
| --- | --- |
| Physical goods | Item with `fulfillment = stockable` / goods traits |
| Services | Item with `fulfillment = service` |
| Memberships | Item with `fulfillment = entitlement` / membership trait (period metadata) |
| Reservation resources (sellable) | Item representing a **bookable offering** (e.g. “Standard Queen rate class”), not a room instance |
| Educational offerings | Item for fee/program/offering definition |
| Healthcare offerings | Item for billable service/procedure **commercial** definition |

### Explicit non-goals

- Becoming a restaurant menu engine, PMS room block, EMR order set, or SIS curriculum  
- Owning inventory quantities (→ Inventory)  
- Owning appointments (→ Scheduling + product)  
- Owning Party master data (→ Parties; optional supplier ref only)

---

## 2. Why MenuItem, Room, Patient Service, and Course are NOT Catalog aggregates

| Concept | Why it is not a Catalog AR | Correct placement |
| --- | --- | --- |
| **MenuItem** | “Menu” is a **presentation/channel layout** (categories, dayparts, modifiers UX, printer classes). The sellable thing is a generic **CatalogItem**; menus **reference** `catalogItemId`s. Elevating MenuItem would bake F&B language into every vertical. | `products/restaurant` menu composition |
| **Room** | A **physical/unit inventory of stay capacity** (room 412, dirty/clean, connecting doors) is operational PMS state — not a commercial SKU. A **room type / rate plan** may be a CatalogItem; the room instance is product. Confusing them breaks hotel ops and pollutes retail/education catalogs. | `products/hotel` rooms + housekeeping; rate/type → CatalogItem |
| **Patient Service** | Clinical meaning (order sets, CPT workflow, care pathways, diagnosis coupling) is healthcare-regulated product language. Commercially billable offerings are CatalogItems; **encounters/charts** reference `catalogItemId` for charging. Calling the AR “PatientService” leaks clinic into restaurants. | `products/clinic` + CatalogItem for billables |
| **Course** | Academic structure (term, section, credits, roster, grading) is SIS product language. A **tuition/fee offering** or “Program fee” is a CatalogItem; **Course/Section** entities live in education product and may point at fee catalog items. | `products/school` + CatalogItem for fees/offerings |

**Composition pattern (all verticals):**

```text
Product presentation / ops entity
        │  references
        ▼
catalog.CatalogItem   (generic)
        │
        ├──► Orders (lines)
        ├──► Inventory (if stockable)
        └──► Scheduling (if bookable offering uses time) — optional
```

---

## 3. Ubiquitous language

| Term | Meaning |
| --- | --- |
| **CatalogItem** | Canonical offering definition (aggregate root) |
| **CatalogItemId** | Opaque id referenced by Orders, Inventory, products |
| **Variant** | Sellable variation (size, color, duration tier) under an item |
| **OfferingKind / traits** | Generic classifiers: goods, service, membership, bookable_offering, education_offering, healthcare_offering (flags/kinds — not subclasses with industry methods) |
| **List price** | Default commercial price; channel overrides may live later in pricing module/product |
| **Tax category** | Tax class code for calculation ports |
| **Stockable** | Trait: Inventory may track quantity for this item/variant |
| **Orderable** | Trait: may appear on Order lines |

Stakeholder “product” means CatalogItem ([glossary](../../glossary.md)) — avoid a `products` domain module colliding with `products/` compositions.

---

## 4. Aggregates

| Aggregate | Responsibility |
| --- | --- |
| **CatalogItem** | Offering definition, variants, prices, tax, traits, status, optional supplier party ref |
| **TaxCategory** (optional AR or ref data) | Tenant or platform tax classes |

```text
CatalogItem (AR)
├── identity (sku/code, names, description)
├── traits / offeringKind flags
├── Variant[]
├── list prices (item or per variant)
├── taxCategoryId
├── status / availability flags
└── optional supplierPartyId (Parties)
```

---

## 5. Aggregates (detail)

### 5.1 CatalogItem

**Invariants:**

1. Belongs to exactly one Tenancy `organizationId`.
2. `code` / SKU unique among non-deleted items within tenant (policy: unique per location applicability optional later).
3. At least one display name.
4. If `stockable`, Inventory may create stock records; Catalog does not store on-hand qty.
5. Variants belong to one item; variant codes unique within item.
6. Soft-delete / inactive items cannot be added to **new** order lines (`assertItemOrderable`).
7. No restaurant/hotel/clinic/school required columns (course credits, room floor, allergy kitchen notes as Core fields). Extension: `metadata` jsonb with pack schema **or** product-side satellite tables keyed by `catalogItemId`.

**Statuses:** `draft` | `active` | `inactive` | `deleted`

**Offering traits (v1 — composable flags):**

| Trait / kind | Meaning |
| --- | --- |
| `goods` | Physical good |
| `service` | Performed service |
| `membership` | Time-bounded entitlement sellable |
| `bookable_offering` | Sold access/rate class tied to capacity elsewhere |
| `education_offering` | Fee/program offering (commercial) |
| `healthcare_offering` | Billable clinical service (commercial) |

An item may combine traits carefully (e.g. goods+stockable); product packs document allowed combinations.

---

## 6. Entities

| Entity | Parent | Role |
| --- | --- | --- |
| **Variant** | CatalogItem | sku suffix, option values, list price override, stockable flag override |
| **ItemPrice** | CatalogItem / Variant | amount, currency, validFrom/to optional |
| **ItemLocationApplicability** | CatalogItem | optional: available at locationIds (empty = all locations in tenant) |

---

## 7. Value objects

| Value object | Description |
| --- | --- |
| **CatalogItemId** / **VariantId** | Opaque ids |
| **OrganizationId** / **LocationId** | Tenant scope / applicability |
| **PartyId** | Optional supplier reference |
| **SkuCode** | Tenant-unique offering code |
| **Money** | `{ currency, amountMinor }` |
| **ItemStatus** | draft/active/inactive/deleted |
| **OfferingTraits** | Set of kind flags |
| **TaxCategoryId** | Tax class reference |

---

## 8. Domain events (contracts)

Outbox for significant changes ([ADR-0003](../../adr/0003-event-contracts-and-outbox.md)). `organizationId` always set.

| Event type | Payload highlights | Consumers |
| --- | --- | --- |
| `catalog.item.created` | catalogItemId, code, traits | Audit, search, inventory seed if stockable |
| `catalog.item.updated` | catalogItemId, changedFields | Cache, channel sync |
| `catalog.item.activated` / `inactivated` | catalogItemId | Orders assert |
| `catalog.item.deleted` | catalogItemId | Block new lines |
| `catalog.variant.created` / `updated` | variantId, catalogItemId | Inventory, POS |
| `catalog.price.changed` | catalogItemId/variantId, money | Channels, audit |

---

## 9. Public APIs

Authorize via RBAC (`catalog.item.read|manage`, …) after tenant context.

### Commands

| API | Behavior |
| --- | --- |
| `createItem({ organizationId, code, name, traits, … })` | Create catalog item |
| `updateItem` / `activateItem` / `inactivateItem` / `deleteItem` | Lifecycle |
| `addVariant` / `updateVariant` / `retireVariant` | Variants |
| `setListPrice({ itemOrVariantId, money })` | Price |
| `setTaxCategory` | Tax |
| `setLocationApplicability` | Where sellable |
| `linkSupplierParty({ catalogItemId, partyId })` | Optional Parties ref |

### Queries

| API | Behavior |
| --- | --- |
| `getItem({ catalogItemId, organizationId })` | Tenant get |
| `findItems({ organizationId, text?, traits?, status?, locationId? })` | Search |
| `assertItemOrderable({ catalogItemId, variantId?, organizationId, locationId? })` | For Orders |
| `resolveListPrice(...)` | Price resolution helper |

### HTTP (illustrative)

- `POST /v1/organizations/:organizationId/catalog/items`
- `GET /v1/organizations/:organizationId/catalog/items`
- `POST /v1/organizations/:organizationId/catalog/items/:id/variants`

---

## 10. Dependencies

| Depends on | Usage |
| --- | --- |
| **Tenancy** | Tenant ownership; location applicability |
| **RBAC** | authorize |
| **Parties** (optional) | supplierPartyId validation |
| **Audit** | outbox projections / optional `record` |

| Must not depend on | Reason |
| --- | --- |
| Orders, Inventory (invert: they depend on Catalog) | Direction |
| Product modules | Anti-leak |
| Identity | Not required for catalog definitions |

---

## 11. Database ownership

Catalog owns `catalog_*` tables.

| Table | Contents |
| --- | --- |
| `catalog_items` | id, organization_id, code, names, traits flags, tax_category_id, status, supplier_party_id, metadata, timestamps |
| `catalog_variants` | id, catalog_item_id, code, options jsonb, status, … |
| `catalog_prices` | id, item_id/variant_id, currency, amount_minor, valid_from/to |
| `catalog_item_locations` | item_id, location_id (applicability) |
| `catalog_tax_categories` | id, organization_id nullable (platform vs tenant), code, … |

**Tenant ownership:** every item row has `organization_id`; all queries filter tenant; no cross-tenant reads without break-glass.

---

## 12. How products compose specialized offerings

### Restaurant — Menu over Catalog

```text
Menu (product) → MenuCategory → MenuEntry { catalogItemId, displayName?, modifierGroups? }
CatalogItem { traits: goods|service, code: "BURGER-01" }
```

Kitchen printer class / course number live on **MenuEntry**, not CatalogItem Core fields.

### Hotel — Room type vs Room

```text
CatalogItem { code: "RT-QUEEN", traits: bookable_offering|service, name: "Queen Room" }
Hotel Room (product) { roomNumber: "412", roomTypeCatalogItemId, status: dirty|clean }
Booking (product) → uses schedule/capacity + charges Orders lines with catalogItemId (rate)
```

### Retail — SKU

```text
CatalogItem + Variants { size/color } → Inventory stock per location
POS Order lines → catalogItemId + variantId
```

### Healthcare — Billable offering vs clinical service

```text
CatalogItem { traits: healthcare_offering|service, code: "PROC-99213" }
Encounter (product) { patientPartyId, lines: [{ catalogItemId, clinical metadata }] }
```

### Education — Fee offering vs Course

```text
CatalogItem { traits: education_offering, code: "FEE-TUITION-UG" }
Course/Section (product) { term, roster, feeCatalogItemId? }
Order { customerPartyId: student/guardian, lines: tuition item }
```

### Professional Services — Service package

```text
CatalogItem { traits: service|membership, code: "PKG-RETAINER-M" }
Engagement (product) { clientPartyId, packageCatalogItemId }
```

---

## 13. Audit & events

- Outbox on create/price change/activate/delete (ADR-0003).  
- Audit actions align with event `type` names.  
- Metadata: ids and amounts — no secrets.

---

## 14. Lifecycle examples

1. **Create goods SKU** → `catalog.item.created` → Inventory may `ensureStockRecord`.  
2. **Inactivate** → Orders `assertItemOrderable` fails for new lines; historical lines unchanged.  
3. **Price change** → `catalog.price.changed`; open draft orders resolve price at commit per Orders policy.  
4. **Restaurant publishes menu** → product writes MenuEntry rows pointing at existing active items — Catalog unchanged.

---

## 15. Seed permissions (illustrative)

| Permission | Intent |
| --- | --- |
| `catalog.item.read` | View catalog |
| `catalog.item.manage` | Create/update/lifecycle/prices |
| `catalog.tax.manage` | Tax categories |

---

## 16. Testing expectations

| Focus | Assertion |
| --- | --- |
| Tenant isolation | Org A cannot read Org B items |
| Anti-leak | No Menu/Room/Course/PatientService types in catalog domain |
| Traits | Stockable items accepted by inventory port tests |
| Orderable assert | Inactive/deleted rejected |
| DAG | Catalog does not import Orders |

---

## 17. Related documents

- [business-capability-map.md](../../architecture/business-capability-map.md)
- [domain-map.md](../../architecture/domain-map.md)
- [parties/design.md](../parties/design.md)
- [ADR-0001](../../adr/0001-platform-technology-foundation.md) / [ADR-0002](../../adr/0002-domain-map.md) / [ADR-0003](../../adr/0003-event-contracts-and-outbox.md)
- [module-standard.md](../../architecture/module-standard.md)
