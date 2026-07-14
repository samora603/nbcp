# Orders Module — Design

| Field | Value |
| --- | --- |
| **Module** | `orders` (`modules/orders` — `@nbcp/orders`) |
| **Layer** | Shared Business ([ADR-0002](../../adr/0002-domain-map.md)) |
| **Stack** | NestJS + Prisma ([ADR-0001](../../adr/0001-platform-technology-foundation.md)) |
| **Structure** | [Module standard](../../architecture/module-standard.md) |
| **Status** | Implemented (S3) — domain facade + in-memory kernel; Nest/Prisma host wiring later |
| **Last updated** | 2026-07-14 |

**Normative companions:** [Business capability map](../../architecture/business-capability-map.md) · [Parties](../parties/design.md) · [Catalog](../catalog/design.md) · [Event contracts / ADR-0003](../../architecture/event-contracts.md) · [Tenant access model](../../architecture/tenant-access-model.md) · **[ADR-0007 — Orders ↔ Inventory timing](../../adr/0007-orders-inventory-reservation-and-issue-timing.md)**

---

## 1. Purpose

The **Orders** module is NBCP’s **reusable commercial order domain**: tenant-owned commitments to buy/sell catalog offerings for a customer party, with line items, **pricing snapshots**, and a clear **lifecycle**.

It answers: *What was ordered, for whom, at what agreed prices/quantities, and where is that commitment in its lifecycle?*

It does **not** answer: *Which dining table, hotel room, patient chart, student section, or kitchen station is involved?* Those are **product workflows** that **reference** `orderId` (and Party/Catalog ids) without modifying Orders.

### Must support (as commercial compositions — not industry aggregates)

| Vertical need | Orders representation |
| --- | --- |
| Restaurant sales | Order + lines (menu items → catalogItemIds); check/ticket UX in product |
| Hotel bookings | Order(s) for stay charges / packages; booking entity in product holds `orderId` |
| Retail sales | POS sale as Order; returns as related orders/flows (product + orders policy) |
| Healthcare services | Billable encounter charges as Order lines; clinical encounter in product |
| Educational enrollments | Tuition/fee Order; enrollment record in product references `orderId` |
| Professional services engagements | Engagement billing Order; engagement entity in product references `orderId` |

### Explicit non-goals

- Kitchen display / routing engines  
- Room assignment / housekeeping  
- Clinical protocols / student grading  
- Payment capture (→ Payments) or ledger posts (→ Ledger)  
- Inventory qty mutation ownership (Orders may emit events; Inventory consumes)

---

## 2. Why table, room, patient, student, and kitchen are NOT Orders concepts

| Concept | Why it is not an Orders field/AR | Correct placement |
| --- | --- | --- |
| **Table** | Dining table is floor ops capacity/state. Putting `tableId` on Order as a Core field restaurants-izes every vertical’s order schema. | Restaurant product: `Check` / `DiningSession` → `orderId` + `tableId` |
| **Room** | Physical room is PMS inventory/state. Stay booking is product; charges are Orders. | Hotel product: `Booking` → `orderId`(s) + `roomId` |
| **Patient** | Clinical subject is a **Party** (`customer` / pack role). “Patient” as Order type leaks healthcare language. | Party as `customerPartyId`; clinic `Encounter` → `orderId` |
| **Student** | Learner is a **Party**. Enrollment/roster are SIS product. | Party as `customerPartyId`; `Enrollment` → `orderId` |
| **Kitchen** | Prep routing, stations, ticket display are F&B ops. Orders emits neutral `orders.order.committed`; kitchen consumes. | Restaurant kitchen module listens to events; never imported by Orders |

**Product attachment pattern (normative):**

```text
Product aggregate (Booking | Encounter | Enrollment | Engagement | DiningSession | PosSale)
        │  stores opaque orderId (+ partyId, catalog refs as needed)
        ▼
orders.Order   (generic commercial commitment)
        │
        ├── events (outbox) ──► Inventory, Payments, kitchen product, …
        └── no imports from products/*
```

Products **never** require Orders to add vertical columns. Optional opaque `source` / `channel` / `externalRef` metadata may store product correlation keys without understanding them.

---

## 3. Ubiquitous language

| Term | Meaning |
| --- | --- |
| **Order** | Commercial commitment aggregate for one tenant |
| **OrderId** | Opaque id referenced by Payments, Ledger, products |
| **Customer party** | `customerPartyId` → Parties (`assertPartyUsable`, typically `customer` role) |
| **Line item** | Quantity of a catalog item/variant at a **snapshotted** price |
| **Pricing snapshot** | Frozen unit price/tax/name/code at line creation or commit time — not a live catalog lookup later |
| **Lifecycle status** | `draft` → `committed` → `fulfilled` / `cancelled` (and optional `partially_fulfilled`) |
| **Channel / source** | Opaque origin (`pos`, `online`, `product:hotel.booking`, …) — not parsed by Orders domain logic |

---

## 4. Aggregates

| Aggregate | Responsibility |
| --- | --- |
| **Order** | Header, customer party, lines, amounts, lifecycle, snapshots |

```text
Order (AR)
├── organizationId, optional locationId (place of sale / service location)
├── customerPartyId
├── status (lifecycle)
├── OrderLine[] (entities)
├── pricing totals (derived from lines + adjustments)
├── channel / source / externalRef (opaque)
└── timestamps / committedAt / cancelledAt …
```

**Adjustments** (discount/surcharge headers): prefer entities on Order (`OrderAdjustment`) with snapshotted amounts — still industry-neutral.

**Returns:** v1 options — (a) new Order with negative lines / `relatedOrderId`, or (b) product-orchestrated credit orders. Prefer **related Order** + type flag `sale` | `return` | `credit` without retail-only fields.

---

## 5. Aggregates (detail)

### 5.1 Order

**Invariants:**

1. Belongs to exactly one Tenancy `organizationId`.
2. `customerPartyId` required for standard sales (policy: anonymous/guest sale may allow null only with explicit flag + ADR — default **required**).
3. Party must pass `parties.assertPartyUsable` for the tenant when setting/changing customer (active; recommended `customer` classification).
4. Lines reference `catalogItemId` (+ optional `variantId`); at add/commit, Catalog `assertItemOrderable`.
5. **Pricing snapshot** on each line at commit (or at add-in-draft with re-snapshot on commit — pick one; **normative: snapshot finalized at `commit`**).
6. Only `draft` allows arbitrary line edits; `committed` is immutable except fulfillment/cancel transitions and controlled adjustments via explicit use cases.
7. Totals = f(lines, adjustments); currency consistent across lines.
8. Optional `locationId` is place-of-business context (validated via Tenancy); AuthZ uses RBAC assignment scope ([tenant access model](../../architecture/tenant-access-model.md)).
9. No Core fields named table/room/patient/student/kitchen.

**Lifecycle statuses:**

| Status | Meaning |
| --- | --- |
| `draft` | Editable; not commercially firm |
| `committed` | Accepted commitment; drives fulfillment/payment/inventory reactions |
| `partially_fulfilled` | Optional intermediate |
| `fulfilled` | Completely fulfilled |
| `cancelled` | Voided after draft or via cancel use case from committed (policy + compensation events) |

Transitions (normative intent):

```text
draft → committed → fulfilled
  │         ├── partially_fulfilled → fulfilled
  │         └── cancelled
  └── cancelled (discard draft)
```

---

## 6. Entities

| Entity | Parent | Role |
| --- | --- | --- |
| **OrderLine** | Order | catalogItemId, variantId?, qty, snapshot (name, code, unitPrice, tax), lineTotal |
| **OrderAdjustment** | Order | type (discount/surcharge), amount, label snapshot |
| **OrderRelation** (optional) | Order | relatedOrderId, relationType (`return_of`, `amendment_of`) |

---

## 7. Value objects

| Value object | Description |
| --- | --- |
| **OrderId** / **OrderLineId** | Opaque ids |
| **OrganizationId** / **LocationId** | Tenant / place context |
| **PartyId** | Customer (and optional bill-to later) |
| **CatalogItemId** / **VariantId** | Offering refs |
| **Money** | `{ currency, amountMinor }` |
| **Quantity** | Positive decimal/int policy |
| **OrderStatus** | Lifecycle enum |
| **OrderType** | `sale` \| `return` \| `credit` (neutral) |
| **PriceSnapshot** | unitPrice, currency, taxRate/taxAmount, catalogName, catalogCode, snappedAt |
| **ChannelRef** | Opaque string |
| **ExternalRef** | Opaque product correlation key |

---

## 8. Domain events (contracts)

Producer-owned facade exports + transactional outbox ([ADR-0003](../../adr/0003-event-contracts-and-outbox.md)). Security/commercial events are outbox-mandatory.

| Event `type` | When | Typical consumers |
| --- | --- | --- |
| `orders.order.created` | Draft created | Audit, product correlation |
| `orders.order.updated` | Draft changed | Product UX caches |
| `orders.order.committed` | Commit | **Inventory reserve** ([ADR-0007](../../adr/0007-orders-inventory-reservation-and-issue-timing.md)), Payments orchestration, kitchen/hotel/clinic **products**, Audit |
| `orders.order.partially_fulfilled` | Partial fulfill | **Inventory issue** (fulfilled qty), Product ops |
| `orders.order.fulfilled` | Complete | **Inventory issue** (residual reserved), Ledger projections (policy), Audit |
| `orders.order.cancelled` | Cancel | **Inventory release** (unissued), Payments void flows, Audit |
| `orders.line.added` / `removed` | Draft only (optional granularity) | Product |
| `orders.pricing.finalized` | On commit | Reporting |

**Payload essentials:** `eventId`, `organizationId`, `orderId`, `customerPartyId`, `locationId?`, `status`, `totals`, `lineSummaries[]` (catalogItemId, qty, money), `correlationId`.

Consumers depend on `@nbcp/orders` **facade** only if DAG allows (Inventory, Payments, products, Audit). **Orders never imports** Inventory/Payments/products.

---

## 9. Public APIs

Authorize: `orders.order.read|manage|commit|cancel|fulfill` after tenant context.

### Commands

| API | Behavior |
| --- | --- |
| `createOrder({ organizationId, locationId?, customerPartyId, channel?, externalRef?, type? })` | Create draft |
| `addLine({ orderId, catalogItemId, variantId?, quantity })` | Draft only; may stash provisional price |
| `updateLineQuantity` / `removeLine` | Draft only |
| `addAdjustment` / `removeAdjustment` | Draft (or controlled post-commit use case) |
| `commitOrder({ orderId })` | Validate party/catalog; **finalize snapshots**; → committed; emit `committed` |
| `fulfillOrder` / `fulfillLines` | → fulfilled / partially_fulfilled |
| `cancelOrder({ orderId, reason })` | Policy by status; emit `cancelled` |
| `createReturnOrder({ originalOrderId, lines… })` | Related return order |

### Queries

| API | Behavior |
| --- | --- |
| `getOrder({ orderId, organizationId })` | Tenant-scoped |
| `findOrders({ organizationId, customerPartyId?, status?, locationId?, … })` | Search |
| `listOrdersByExternalRef({ organizationId, externalRef })` | Product correlation |

### HTTP (illustrative)

- `POST /v1/organizations/:organizationId/orders`
- `POST /v1/organizations/:organizationId/orders/:orderId/lines`
- `POST /v1/organizations/:organizationId/orders/:orderId/commit`
- `POST /v1/organizations/:organizationId/orders/:orderId/fulfill`
- `POST /v1/organizations/:organizationId/orders/:orderId/cancel`

---

## 10. Dependencies

```text
Core:     identity ← tenancy ← rbac ; audit ← (events)
Shared:   orders → parties, catalog, tenancy, rbac
          orders ↛ inventory | payments | ledger | products
          inventory | payments | products → orders (events/facade)
```

| Depends on | Usage |
| --- | --- |
| **Parties** | `customerPartyId`, `assertPartyUsable` |
| **Catalog** | line offerings, `assertItemOrderable`, price inputs before snapshot |
| **Tenancy** | org/location validity |
| **RBAC** | authorize |
| **Identity** | only via session in host — Orders module needs PrincipalId on commands from app context, not Identity package for business logic |

| Forbidden reverse deps | Why |
| --- | --- |
| Parties/Catalog → Orders | Layering |
| Orders → Restaurant/Hotel/… | Anti-leak |
| Orders → Inventory/Payments | Use events; avoid cycles |

---

## 11. Database ownership

Orders owns `orders_*` tables.

| Table | Contents |
| --- | --- |
| `orders_orders` | id, organization_id, location_id, customer_party_id, status, type, currency, totals, channel, external_ref, committed_at, cancelled_at, … |
| `orders_lines` | id, order_id, catalog_item_id, variant_id, quantity, snapshot jsonb/columns, line_total, … |
| `orders_adjustments` | id, order_id, type, amount, label, … |
| `orders_relations` | id, order_id, related_order_id, relation_type |

**Tenant ownership rules:**

1. Every order row has `organization_id`; lines inherit via order (repositories always join/filter tenant).
2. All queries include tenant predicate.
3. Cross-tenant access forbidden without break-glass + audit.
4. Opaque ids only to Parties/Catalog — prefer no cross-module FKs without ADR.

---

## 12. Audit requirements

| Action | Requirement |
| --- | --- |
| create / commit / fulfill / cancel | Outbox events → Audit projection (mandatory checklist for commit/cancel) |
| customer or large total changes on draft | Recommended audit |
| Metadata | ids, amounts, status — **no** card data/PII beyond party id |

Align Audit `action` with event `type` ([audit design](../audit/design.md), [event-contracts.md](../../architecture/event-contracts.md)).

---

## 13. Event contract summary

- **Producer:** `orders`  
- **Export:** facade event types + envelope  
- **Idempotency:** `eventId`  
- **Key consumer contracts:** Inventory reacts per [ADR-0007](../../adr/0007-orders-inventory-reservation-and-issue-timing.md) (`committed` → reserve, fulfill → issue, `cancelled` → release); Payments may create intents against `orderId`; products wire workflows  

---

## 14. How products attach workflows without modifying Orders

| Product | Product aggregate | Link | Workflow without Orders change |
| --- | --- | --- | --- |
| **Restaurant** | `DiningSession` / `KitchenTicket` | `orderId`, `tableId` | On `orders.order.committed` → create kitchen tickets |
| **Hotel** | `Booking` / `Folio` | `orderId`, `roomId` | Booking confirm → `commitOrder`; room assign stays in hotel module |
| **Retail** | `PosSale` / till session | `orderId`, register id | Device UX in product; Order is sale commitment |
| **Healthcare** | `Encounter` | `orderId`, `patientPartyId` (= customer) | Clinical docs in encounter; billables as order lines |
| **Education** | `Enrollment` | `orderId`, `studentPartyId` | Roster in enrollment; tuition order separate |
| **Professional Services** | `Engagement` | `orderId`, `clientPartyId` | Delivery milestones in engagement; invoices via orders/payments |

**Extension mechanisms (allowed):**

1. `externalRef` / `channel` on Order header  
2. Product tables FK/id → `orderId`  
3. Event handlers in **product** or **shared** downstream modules  
4. Pack metadata on lines via reserved `line.metadata` jsonb **without** Orders interpreting keys (document per pack)

**Forbidden:** PRs that add `tableId` / `roomId` / `patientMrn` columns to `orders_orders`.

---

## 15. Lifecycle examples

### Restaurant sale

1. Create draft Order + `customerPartyId` (walk-in party).  
2. Add lines from catalog (menu maps to catalog ids).  
3. Product sets `externalRef=diningSession:…`.  
4. `commitOrder` → kitchen product consumes event.  
5. Payments captures against `orderId`.  
6. `fulfillOrder` when service complete (product-defined).

### Hotel booking

1. Product creates `Booking` (dates, room type).  
2. Create Order lines for rate/package catalog items + guest party.  
3. Commit on guarantee; assign room in hotel module only.  
4. Additional folio charges = new lines on related orders or new orders linked by `externalRef=booking:…`.

### Retail POS

1. Draft Order at location; add SKUs.  
2. Commit → Inventory **reserves** stockable lines ([ADR-0007](../../adr/0007-orders-inventory-reservation-and-issue-timing.md)).  
3. Pay (Payments) as product requires; composer may `fulfillOrder` immediately after commit/pay so Inventory **issues** in the same user action (issue-on-commit is **not** the platform default).  
4. Return: `createReturnOrder` related to original.

### Healthcare / Education / Professional Services

Same Order lifecycle; product entities hold clinical/academic/engagement state and point at `orderId` for money movement.

---

## 16. Seed permissions (illustrative)

| Permission | Intent |
| --- | --- |
| `orders.order.read` | View orders |
| `orders.order.manage` | Create/edit draft |
| `orders.order.commit` | Commit |
| `orders.order.fulfill` | Fulfill |
| `orders.order.cancel` | Cancel |

---

## 17. Testing expectations

| Focus | Assertion |
| --- | --- |
| Tenant isolation | Org-scoped get/find |
| Snapshot immutability | Catalog price change after commit does not alter line snapshots |
| Party/catalog asserts | Commit fails if party/item not usable |
| Anti-leak | Domain model has no table/room/patient/student/kitchen types |
| DAG | No imports of inventory/payments/products |
| Outbox | Commit writes outbox in same transaction |

---

## 18. Implementation roadmap (non-binding)

1. Draft order + lines + commit with snapshots  
2. Cancel/fulfill  
3. Adjustments + return orders  
4. Inventory/Payments consumer integration guides  
5. Pack `line.metadata` conventions ADR if needed  

---

## 19. Related documents

- [business-capability-map.md](../../architecture/business-capability-map.md) §4  
- [domain-map.md](../../architecture/domain-map.md) §5.3  
- [parties/design.md](../parties/design.md) · [catalog/design.md](../catalog/design.md)  
- [ADR-0001](../../adr/0001-platform-technology-foundation.md) / [0002](../../adr/0002-domain-map.md) / [0003](../../adr/0003-event-contracts-and-outbox.md) / [**0007**](../../adr/0007-orders-inventory-reservation-and-issue-timing.md)  
- [module-standard.md](../../architecture/module-standard.md)
