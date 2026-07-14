# Business Capability Map

**Status:** Normative (platform orientation check)  
**Last updated:** 2026-07-14  
**Authority:** Complements [domain-map.md](domain-map.md) ([ADR-0002](../adr/0002-domain-map.md)); does not replace module designs  

This map shows how each **Shared Business** capability is reused across vertical products. Its purpose is to prove shared domains stay **platform-oriented**, not restaurant-oriented (or hotel-/clinic-oriented).

**Products in scope:** Restaurant · Hotel · Retail · Healthcare · Education · Professional Services  

**Kernel (prerequisite for all):** Identity · Tenancy · RBAC · Audit — see [tenant-access-model.md](tenant-access-model.md).

---

## 1. How to read this map

For each shared domain:

| Section | Meaning |
| --- | --- |
| **Reusable core** | Industry-neutral invariants owned by the shared module |
| **Product consumption** | How each vertical *uses* the core |
| **Must NOT leak** | Concepts that stay in `products/*` (or product modules) |

**Rule:** If a concept has a different ubiquitous language per vertical (Menu vs Room vs Course vs Patient Service), it is **composition/UX**, not a shared aggregate name.

---

## 2. Parties

**Design:** [parties/design.md](../modules/parties/design.md)

### Reusable core

Tenant-owned **Party** master (individual or organization counterparty); classifications (`customer`, `supplier`, `vendor`, `employee`); channels; addresses; optional `PrincipalId` link; relationships.

### Product consumption

| Product | Consumption |
| --- | --- |
| **Restaurant** | Guests/diners as Party + `customer`; suppliers for food; staff as `employee` |
| **Hotel** | Guests + corporate accounts as parties; travel agents as org parties |
| **Retail** | Shoppers/loyalty customers; suppliers/vendors |
| **Healthcare** | Patients/guardians as parties (product may register extension role keys); referring orgs |
| **Education** | Students/guardians; institutional customers |
| **Professional Services** | Clients (individual or firm); consultants as `employee` + principal link |

### Must NOT leak into Parties

Guest folio, patient chart, student enrollment, dining reservation hold, room stay — all reference `partyId` from product tables.

---

## 3. Catalog

**Design:** [catalog/design.md](../modules/catalog/design.md)

### Reusable core

Tenant-owned **CatalogItem** definitions: sellable/stockable/bookable commercial offerings with kind/traits (physical good, service, membership, bookable resource offering, educational offering, healthcare offering) — **generic types**, not industry aggregates. Variants, tax categories, list prices, availability flags.

### Product consumption

| Product | Consumption |
| --- | --- |
| **Restaurant** | Dishes/modifiers as catalog items; menus are product composition over items |
| **Hotel** | Rate plans / add-on services as catalog items; room *types* map to items — physical rooms are product |
| **Retail** | SKUs / variants as catalog items |
| **Healthcare** | Billable procedure/service offerings as catalog items |
| **Education** | Tuition/fee/offering definitions as catalog items; class sections are product |
| **Professional Services** | Service SKUs / retainers / packages as catalog items |

### Must NOT leak into Catalog

**MenuItem, Room (instance), Patient Service (clinical protocol), Course (academic term structure)** as aggregate *names* or clinical/curriculum invariants — see Catalog design for why. Product modules compose presentations and operational resources atop `catalogItemId`.

---

## 4. Orders

### Reusable core

Commercial **Order** commitment: parties, lines referencing catalog items, amounts, lifecycle (draft→committed→fulfilled/cancelled). Industry-neutral.

### Product consumption

| Product | Consumption |
| --- | --- |
| **Restaurant** | Checks / tickets; kitchen routing is product over order events |
| **Hotel** | Folio charge orders / packages |
| **Retail** | POS sale tickets; returns as related orders/flows (product + orders) |
| **Healthcare** | Billable encounter invoices / claims stubs as orders |
| **Education** | Tuition/fee orders |
| **Professional Services** | SOW / engagement billing orders |

### Must NOT leak into Orders

Table number, kitchen station, room number, POS tender UI, diagnosis codes, grade terms as first-class Order fields. Opaque `channel`/`source` metadata only when needed; vertical attrs via product extensions.

---

## 5. Inventory

### Reusable core

Stock quantities and movements for **stockable** catalog items per tenancy location: on-hand, receipts, issues, adjustments, transfers, soft reserves.

### Product consumption

| Product | Consumption |
| --- | --- |
| **Restaurant** | Ingredients / beverage stock; recipe explosion is product |
| **Hotel** | Minibar/F&B stock — **not** room inventory |
| **Retail** | Core merchandising stock |
| **Healthcare** | Supplies / pharma stock (regulated fields in product) |
| **Education** | Materials / bookstore stock |
| **Professional Services** | Parts/tools kits when needed |

### Must NOT leak into Inventory

Dining tables, hotel rooms, practitioner capacity, classroom seats as “stock.” Those are scheduling/product resources.

---

## 6. Ledger

### Reusable core

Append-only accounting posts, accounts, balances — configurable chart, no industry hardcoding.

### Product consumption

| Product | Consumption |
| --- | --- |
| **All** | AR/AP/revenue recognition from orders/payments; party dimensions via `partyId` |

### Must NOT leak into Ledger

POS drawer UX, tip pooling rules, clinical billing nuances beyond dims/metadata; restaurant “Z-report” as ledger aggregate.

---

## 7. Payments

### Reusable core

Payment intents/attempts, capture/refund against payables (typically orders); PSP ports via integrations.

### Product consumption

| Product | Consumption |
| --- | --- |
| **Restaurant** | Check settlement; tip as metadata/line policy in product |
| **Hotel** | Deposit/folio settlement |
| **Retail** | Tender capture at POS (device UX product) |
| **Healthcare** | Copay / patient pay |
| **Education** | Tuition payments |
| **Professional Services** | Retainer / invoice pay |

### Must NOT leak into Payments

Cash drawer sessions, card present device drivers, tip-out labor rules as Payments aggregates.

---

## 8. Scheduling

### Reusable core

Neutral **Resource** + **ScheduleEntry** (time ranges, conflicts at generic level); optional attendee `partyId`.

### Product consumption

| Product | Consumption |
| --- | --- |
| **Restaurant** | Staff shifts; **not** dining reservations as shared Reservation entity |
| **Hotel** | Resource occupancy aids; **Bookings** remain product (may use schedule entries) |
| **Retail** | Staff shifts / appointment retail |
| **Healthcare** | Appointment slots composed with product encounter rules |
| **Education** | Class meeting times |
| **Professional Services** | Consultation time blocks |

### Must NOT leak into Scheduling

`DiningReservation`, `HotelBooking`, `HousekeepingSlot` types; clinical acuity rules.

---

## 9. Notifications

### Reusable core

Notification intents, template refs, channel dispatch (email/SMS/push) via ports.

### Product consumption

| Product | Consumption |
| --- | --- |
| **All** | Receipts, reminders, invites; **template content** may be product-specific |

### Must NOT leak into Notifications

Vertical workflow engines; product owns “when,” shared owns “send.”

---

## 10. Reporting

### Reusable core

Authorized, tenant-scoped query/export primitives and async export jobs.

### Product consumption

| Product | Consumption |
| --- | --- |
| **All** | Sales, stock, occupancy, clinical ops, academic, utilization reports via read models — filters always tenant-bound |

### Must NOT leak into Reporting

Cross-tenant “platform god queries” without break-glass + audit; product-specific metric names as required shared schema without ADR.

---

## 11. Capability × product matrix (summary)

| Capability | Rest. | Hotel | Retail | Health | Educ. | Prof. Svcs |
| --- | --- | --- | --- | --- | --- | --- |
| Parties | ● | ● | ● | ● | ● | ● |
| Catalog | ● | ● | ● | ● | ● | ● |
| Orders | ● | ● | ● | ● | ● | ● |
| Inventory | ● | ◐ | ● | ● | ◐ | ◐ |
| Ledger | ● | ● | ● | ● | ● | ● |
| Payments | ● | ● | ● | ● | ● | ● |
| Scheduling | ◐ | ◐ | ◐ | ● | ● | ● |
| Notifications | ● | ● | ● | ● | ● | ● |
| Reporting | ● | ● | ● | ● | ● | ● |

● = primary reuse · ◐ = partial / optional

---

## 12. Platform-orientation validation

| Check | Result |
| --- | --- |
| Shared aggregates use neutral names (Party, CatalogItem, Order, …) | **Pass** |
| Restaurant Menu/Table/Kitchen stay product-side | **Pass** |
| Hotel Room instance / Housekeeping stay product-side | **Pass** |
| Healthcare chart / Education enrollment stay product-side | **Pass** |
| First vertical (restaurant) can ship without renaming shared kernels | **Pass** |

**Conclusion:** Shared domains remain a **platform commercial kernel**. Vertical differentiation belongs in product compositions referencing shared ids (`partyId`, `catalogItemId`, `orderId`, …).

---

## 13. Related documents

- [domain-map.md](domain-map.md)
- [modules/parties/design.md](../modules/parties/design.md)
- [modules/catalog/design.md](../modules/catalog/design.md)
- [product/README.md](../product/README.md)
- [ADR-0002](../adr/0002-domain-map.md)
