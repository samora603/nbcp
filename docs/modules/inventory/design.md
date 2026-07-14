# Inventory Module — Design

| Field | Value |
| --- | --- |
| **Module** | `inventory` (`modules/inventory` — future implementation) |
| **Layer** | Shared Business ([ADR-0002](../../adr/0002-domain-map.md)) |
| **Stack** | NestJS + Prisma ([ADR-0001](../../adr/0001-platform-technology-foundation.md)) |
| **Structure** | [Module standard](../../architecture/module-standard.md) |
| **Status** | Design only — no implementation in this document |
| **Last updated** | 2026-07-14 |

**Normative companions:** [Business capability map](../../architecture/business-capability-map.md) · [Catalog](../catalog/design.md) · [Parties](../parties/design.md) · [Orders](../orders/design.md) · [Event contracts / ADR-0003](../../architecture/event-contracts.md) · [Tenant access model](../../architecture/tenant-access-model.md) · **[ADR-0007 — Orders ↔ Inventory timing](../../adr/0007-orders-inventory-reservation-and-issue-timing.md)**

---

## 1. Purpose

The **Inventory** module is NBCP’s **reusable stock domain**: tenant-owned quantities of **stockable catalog offerings** at **stock locations**, with receipts, transfers, adjustments, and soft reservations.

It answers: *How much of this catalog item (variant) is on hand, reserved, or in transit at which location — and what movements occurred?*

It does **not** answer: *How is a recipe exploded, which menu to print, how KDS works, which hotel room is dirty, or which patient received a supply?* Those workflows **consume inventory events/APIs** and store vertical state in product tables.

### Must support (as stock — not industry aggregates)

| Vertical need | Inventory representation |
| --- | --- |
| Retail stock | Stock levels per SKU/variant per store location |
| Restaurant ingredients | Stock levels for stockable catalog goods (ingredients) |
| Hotel consumables | Minibar / F&B / amenity SKUs — **not** guest rooms |
| Healthcare supplies | Supply SKUs per clinic location (regulated attrs in product) |
| Educational assets | Materials / bookstore / lab consumables |
| Professional-services materials | Parts, kits, tools tracked as stockable items |

### Explicit non-goals / must NOT own

| Forbidden in Inventory | Belongs in |
| --- | --- |
| **Recipes** / BOM explosion UI | Restaurant (or shared BOM module via future ADR) consuming stock issues |
| **Menus** | Restaurant product over Catalog |
| **Kitchen logic** / KDS | Restaurant product listening to Orders events |
| **Room inventory** (room 412 state) | Hotel product |
| **Patient workflows** / dispense clinical charting | Healthcare product |
| Catalog definitions / list prices | Catalog |
| Party master data | Parties (`supplierPartyId` is a **reference** only) |
| Order lifecycle | Orders (Inventory **reacts** to order events) |

---

## 2. Why recipes, menus, kitchen, rooms, and patients are not Inventory

| Concept | Why not Inventory | Correct consumption |
| --- | --- | --- |
| **Recipes** | Transform finished goods ← ingredients is production logic with yields/waste rules that are F&B-specific (or manufacturing-specific). Inventory only records resulting **issues/receipts**. | Product calls `issueStock` / listens to production events |
| **Menus** | Presentation of catalog items | Restaurant + Catalog |
| **Kitchen** | Prep routing from `orders.order.committed` | Restaurant kitchen module |
| **Room inventory** | Capacity/state of stay units ≠ SKU on-hand | Hotel rooms aggregate |
| **Patient workflows** | Clinical dispense / chargeable use | Clinic encounter + optional `issueStock` with `externalRef` |

**Product consumption without extending inventory tables:**

```text
Product table (recipe_run | dispense | minibar_charge | …)
  └── stores inventoryMovementId / correlates via externalRef
Inventory API / events
  └── stock rows remain generic (catalogItemId, locationId, qty)
```

No `recipeId`, `roomId`, or `patientId` columns on `inventory_*`. Use opaque `externalRef` / `reasonCode` / movement metadata.

---

## 3. Ubiquitous language

| Term | Meaning |
| --- | --- |
| **Stock item** | Tracked balance for a catalog item (+ optional variant) at a stock location |
| **Stock location** | Place quantities live — typically aligns with Tenancy **Location** (`locationId`); may allow sub-locations later |
| **On-hand** | Quantity physically available |
| **Reserved** | Soft hold (e.g. for committed orders) not yet issued |
| **Available** | on-hand − reserved (policy) |
| **Receipt** | Inbound movement (PO receipt, return-to-stock, adjustment up) |
| **Issue** | Outbound movement (sale fulfillment, consumption, write-off) |
| **Transfer** | Movement between two stock locations in the same tenant |
| **Adjustment** | Corrective qty change with reason (count, damage, theft) |
| **catalogItemId** | Required link to Catalog (item must be stockable) |
| **supplierPartyId** | Optional Parties ref on receipts / stock provenance |

**Stock location vs Tenancy Location:** v1 **normative** — `stockLocationId` **is** Tenancy `LocationId` (1:1). Sub-bins (`shelf`, `fridge`) deferred; if added, they nest under a Tenancy location without becoming hotel rooms.

---

## 4. Aggregates

| Aggregate | Responsibility |
| --- | --- |
| **StockItem** | Balance + reservations for one (tenant, catalogItem, variant?, location) |
| **StockMovement** (or Movement as AR per transaction) | Immutable movement document: receipt, issue, transfer, adjustment |

**Preference:** Treat each movement document as an **append-oriented AR** that applies qty changes to StockItem(s) in one transaction; StockItem is the balance aggregate.

```text
StockItem (AR)
├── organizationId
├── locationId
├── catalogItemId
├── variantId?
├── quantityOnHand
├── quantityReserved
└── StockReservation[] (optional entities)

StockMovement (AR)
├── type: receipt | issue | transfer | adjustment
├── lines[] (catalogItemId, variantId?, qty, unit cost snapshot optional)
├── fromLocationId? / toLocationId?
├── supplierPartyId?
├── reasonCode / externalRef
└── occurredAt
```

---

## 5. Aggregates (detail)

### 5.1 StockItem

**Invariants:**

1. Unique among active rows on `(organizationId, locationId, catalogItemId, variantId)`.
2. Catalog item must be **stockable** (`catalog.assert` / traits) when creating stock record.
3. `quantityOnHand >= 0` unless negative stock explicitly allowed by tenant policy (default **deny**).
4. `quantityReserved >= 0` and `quantityReserved <= quantityOnHand` under default policy.
5. Always tenant-scoped; location must belong to organization (Tenancy facade).

### 5.2 StockMovement

**Invariants:**

1. Immutable after post (corrections = reversing movement + new movement).
2. Transfer: same tenant; from ≠ to; decreases from, increases to atomically.
3. Receipt may reference `supplierPartyId` (Parties `supplier`/`vendor` recommended).
4. Issue/transfer/adjust fails if available qty insufficient (unless policy override + permission).
5. No vertical FKs (recipe/room/patient).

---

## 6. Entities

| Entity | Parent | Role |
| --- | --- | --- |
| **StockReservation** | StockItem | qty, source (`orderId` opaque), expiresAt?, status |
| **StockMovementLine** | StockMovement | item/variant, qty, optional unitCost snapshot |

---

## 7. Value objects

| Value object | Description |
| --- | --- |
| **StockItemId** / **StockMovementId** | Opaque ids |
| **OrganizationId** / **LocationId** | Tenant + stock place |
| **CatalogItemId** / **VariantId** | Offering identity |
| **PartyId** | Optional supplier |
| **Quantity** | Non-negative decimal policy |
| **MovementType** | receipt \| issue \| transfer \| adjustment |
| **ReasonCode** | Stable string (`cycle_count`, `damage`, `sales_issue`, …) — pack-extensible |
| **ExternalRef** | Opaque product correlation |
| **Money** | Optional unit cost on movements |

---

## 8. Domain events (contracts)

Producer-owned facade + transactional outbox ([ADR-0003](../../adr/0003-event-contracts-and-outbox.md)). Security/stock integrity events are outbox-mandatory.

| Event `type` | When | Typical consumers |
| --- | --- | --- |
| `inventory.stock_item.created` | First balance row | Audit, reporting |
| `inventory.stock.received` | Receipt posted | Audit, ledger (optional), product |
| `inventory.stock.issued` | Issue posted | Audit, product (recipes/dispense) |
| `inventory.stock.transferred` | Transfer posted | Audit, reporting |
| `inventory.stock.adjusted` | Adjustment posted | **Audit (mandatory)** |
| `inventory.stock.reserved` / `reservation.released` | Soft reserve | Orders fulfillment aids |
| `inventory.stock.low` (optional) | Below reorder threshold | Notifications |

**Payload essentials:** organizationId, locationId(s), catalogItemId, variantId?, quantities, movementId, supplierPartyId?, externalRef?, correlationId.

---

## 9. Public APIs

Authorize after tenant context: `inventory.stock.read|receive|issue|transfer|adjust|reserve`.

### Commands

| API | Behavior |
| --- | --- |
| `ensureStockItem({ organizationId, locationId, catalogItemId, variantId? })` | Create zero balance if missing |
| `receiveStock({ …, lines, supplierPartyId?, externalRef? })` | Receipt movement |
| `issueStock({ …, lines, reasonCode, externalRef? })` | Issue movement |
| `transferStock({ fromLocationId, toLocationId, lines, … })` | Transfer |
| `adjustStock({ locationId, catalogItemId, delta or absolute, reasonCode })` | Adjustment |
| `reserveStock({ orderId as externalRef, lines })` | Soft reserve for commit |
| `releaseReservation({ reservationId }` / by order ref) | Release |
| `issueAgainstReservation(...)` | Convert reserve → issue |

### Queries

| API | Behavior |
| --- | --- |
| `getStockItem(...)` | Balance at location |
| `listStock({ organizationId, locationId?, catalogItemId? })` | Search |
| `listMovements({ organizationId, filters })` | History |
| `getAvailability(...)` | on-hand − reserved |

### HTTP (illustrative)

- `GET /v1/organizations/:organizationId/inventory/stock`
- `POST /v1/organizations/:organizationId/inventory/receipts`
- `POST /v1/organizations/:organizationId/inventory/issues`
- `POST /v1/organizations/:organizationId/inventory/transfers`
- `POST /v1/organizations/:organizationId/inventory/adjustments`

---

## 10. Dependencies

```text
inventory → catalog, parties (optional supplier), tenancy, rbac
inventory ↛ orders | products | recipes
orders / products → inventory  (via events or application orchestration)
```

| Depends on | Usage |
| --- | --- |
| **Catalog** | stockable assert; item/variant identity |
| **Parties** | optional `supplierPartyId` validation |
| **Tenancy** | organization + location |
| **RBAC** | authorize |
| **Audit** | outbox consumers / optional `record` for adjusts |

| No reverse deps | |
| --- | --- |
| Catalog/Parties → Inventory | Forbidden |
| Inventory → Orders | Use app composer or Inventory **handler** on `orders.order.committed` (Inventory depends on Orders **facade/events** — allowed one-way). Products may also call `reserve`/`issue` explicitly |

**Orders integration (normative — [ADR-0007](../../adr/0007-orders-inventory-reservation-and-issue-timing.md)):**

- On `orders.order.committed` → **reserve** stockable lines (soft hold; on-hand unchanged).  
- On `orders.order.partially_fulfilled` / fulfill qty / `orders.order.fulfilled` → **issue** against reservation (decrement on-hand).  
- On `orders.order.cancelled` → **release** unissued reservations; already-issued qty corrected only via compensating movements.  
- Non-stockable / service lines → no Inventory effect.  
- Hard availability gate before commit (when required) lives in the **host/product composer**, not Orders → Inventory imports.

Inventory may depend on Orders **event contracts** (DAG: inventory → orders). Orders must **not** depend on Inventory.

---

## 11. Database ownership

Inventory owns `inventory_*` tables.

| Table | Contents |
| --- | --- |
| `inventory_stock_items` | id, organization_id, location_id, catalog_item_id, variant_id, qty_on_hand, qty_reserved, … |
| `inventory_reservations` | id, stock_item_id, qty, external_ref, status, … |
| `inventory_movements` | id, organization_id, type, from_location_id, to_location_id, supplier_party_id, reason_code, external_ref, occurred_at, … |
| `inventory_movement_lines` | id, movement_id, catalog_item_id, variant_id, qty, unit_cost, … |

**Tenant ownership rules:**

1. Every stock/movement row carries `organization_id`.
2. All queries filter by tenant; location must belong to org.
3. No cross-tenant transfers.
4. Opaque refs to Catalog/Parties; no vertical FKs.

---

## 12. Audit requirements

| Action | Requirement |
| --- | --- |
| adjust / receive / issue / transfer | Outbox → Audit (adjustments **mandatory** on checklist) |
| Metadata | ids, qtys, reasonCode — no secrets |
| Reversals | New movement; link via `externalRef` or `reversesMovementId` in metadata |

---

## 13. Event contract summary

- **Producer:** `inventory`  
- **Also consumes:** `orders.order.committed` / `cancelled` (optional built-in handlers)  
- **Export:** facade events for movements/reservations  
- **Idempotency:** `eventId`; movement posting idempotent on `(organizationId, externalRef, type)` when externalRef provided  

---

## 14. How products consume Inventory without extending inventory tables

| Product | Product-side state | Inventory call / event |
| --- | --- | --- |
| **Restaurant** | `RecipeRun`, prep loss | `issueStock` with `externalRef=recipeRun:…` |
| **Hotel** | Minibar charge line on folio | `issueStock` + Orders/Payments for charge |
| **Retail** | — | Default issue/reserve from order commit handler |
| **Healthcare** | `SupplyDispense` on encounter | `issueStock` + `externalRef=dispense:…` |
| **Education** | Lab checkout record | `issueStock` / transfer to lab location |
| **Professional Services** | Job kit allocation | `transferStock` / `reserveStock` with job externalRef |

Product tables store `stockMovementId` or externalRef keys — **never** alter Inventory schemas for vertical attributes (lot clinical, allergen prep, etc. → product metadata or future lot-tracking ADR).

---

## 15. Lifecycle examples

### Retail sale

1. Catalog stockable SKU; `ensureStockItem` at store location.  
2. Receipt from supplier (`supplierPartyId`).  
3. Order commit → **reserve**; fulfill → **issue** ([ADR-0007](../../adr/0007-orders-inventory-reservation-and-issue-timing.md)).  
4. Transfer store A → B for replenishment.

### Restaurant ingredient

1. Ingredient as Catalog goods+stockable.  
2. Receive case goods.  
3. Recipe run (product) issues raw qty; Inventory only sees issue movement.

### Hotel / clinic / school / professional

Same stock movements; product correlates via `externalRef` without room/patient columns on inventory tables.

---

## 16. Seed permissions (illustrative)

| Permission | Intent |
| --- | --- |
| `inventory.stock.read` | View balances |
| `inventory.stock.receive` | Receipts |
| `inventory.stock.issue` | Issues |
| `inventory.stock.transfer` | Transfers |
| `inventory.stock.adjust` | Adjustments (sensitive) |
| `inventory.stock.reserve` | Reservations |

---

## 17. Testing expectations

| Focus | Assertion |
| --- | --- |
| Tenant + location isolation | No cross-org qty reads |
| Insufficient qty | Issue/transfer denied by default |
| Catalog stockable gate | Non-stockable cannot ensure stock |
| Anti-leak | No recipe/menu/room/patient types in domain |
| DAG | Orders ↛ Inventory; Inventory may → Orders events |
| Outbox | Adjust posts outbox in same TX |
| Idempotent replay | Same externalRef receipt not double-applied |

---

## 18. Implementation roadmap (non-binding)

1. StockItem + receive/issue/adjust  
2. Transfer + reservations  
3. Orders event handlers  
4. Low-stock notifications (optional)  
5. Lot/serial tracking ADR if regulated verticals demand  

---

## 19. Related documents

- [business-capability-map.md](../../architecture/business-capability-map.md) §5  
- [domain-map.md](../../architecture/domain-map.md) §5.6  
- [catalog/design.md](../catalog/design.md) · [parties/design.md](../parties/design.md) · [orders/design.md](../orders/design.md)  
- [ADR-0001](../../adr/0001-platform-technology-foundation.md) / [0002](../../adr/0002-domain-map.md) / [0003](../../adr/0003-event-contracts-and-outbox.md) / [**0007**](../../adr/0007-orders-inventory-reservation-and-issue-timing.md)  
- [module-standard.md](../../architecture/module-standard.md) · [audit/design.md](../audit/design.md)
