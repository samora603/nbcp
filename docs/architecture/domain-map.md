# NBCP Domain Map

**Status:** Accepted (authoritative)  
**ADR:** [ADR-0002](../adr/0002-domain-map.md)  
**Last updated:** 2026-07-14  

This document is the definitive map of NBCP bounded contexts. It separates what must be reusable across verticals from what must stay product-specific. Implementation modules (when scaffolded) must follow this map and [ADR-0001](../adr/0001-platform-technology-foundation.md).

---

## 1. Purpose

NBCP powers multiple products without forking the platform:

| Product vertical | Repository composition (planned) |
| --- | --- |
| Restaurant | `products/restaurant` |
| Hotel | `products/hotel` |
| Retail POS | `products/retail-pos` |
| Healthcare | `products/clinic` |
| Education | `products/school` |
| Professional Services | `products/professional-services` (planned) |

**Strategy:** build reusable domains first; compose verticals on top. Never generalize a restaurant app after the fact.

---

## 2. Domain layers

```text
┌─────────────────────────────────────────────────────────────┐
│                 Product-Specific Domains                    │
│   Restaurant │ Hotel │ Retail │ Healthcare │ Education │ …  │
└───────────────────────────┬─────────────────────────────────┘
                            │ may use
┌───────────────────────────▼─────────────────────────────────┐
│                 Shared Business Domains                     │
│  Parties · Catalog · Orders · Payments · Ledger · Inventory │
│  Scheduling · Notifications · Reporting · …                 │
└───────────────────────────┬─────────────────────────────────┘
                            │ must use
┌───────────────────────────▼─────────────────────────────────┐
│                  Core Platform Domains                      │
│     Identity · Tenancy · RBAC · Audit · Files · Billing     │
│              Workflow · Integrations (adapters)             │
└─────────────────────────────────────────────────────────────┘
```

| Layer | Question it answers | Allowed to know about |
| --- | --- | --- |
| **Core Platform** | Who are you, which org, what may you do, what was done, how do we run the platform? | Nothing product- or industry-specific |
| **Shared Business** | What commercial/operational facts are common across industries? | Core platform only (+ other shared domains via facade/events) |
| **Product-Specific** | What makes this vertical unique? | Core + shared business; **never** imported by core/shared |

---

## 3. Placement decisions (explicit)

These names are frequently confused. The following placements are **normative**.

| Term | Layer | Module (canonical) | Decision |
| --- | --- | --- | --- |
| **Party** | Shared Business | `parties` | Canonical master record for people/organizations dealt with by a tenant (guests, patients, students, clients, suppliers). |
| **Customer** | *Alias / role* | — | Not a separate core module. A **Customer** is a **Party** (or Party + role/relationship) in a buying context. Product UIs may say “Customer”; persistence and APIs prefer `Party` / relationships. |
| **Catalog** | Shared Business | `catalog` | Canonical sellable/stockable/orderable definitions (items, services, variants, prices as commercial facts—not menus or POS screens). |
| **Product** | *Alias* | — | In stakeholder language, “product” often means a catalog item. In code/APIs use **Catalog Item** (or `CatalogProduct` only if needed for clarity). Do **not** create a parallel `products` domain module that duplicates catalog. |
| **Order** | Shared Business | `orders` | Canonical commercial commitment: lines, quantities, amounts, fulfillment states shared across restaurant tickets, hotel folios charges, POS tickets, clinic invoices, tuition invoices, professional engagements—specialized *presentation* stays in products. |
| **Payment** | Shared Business | `payments` | Capture of payment attempts/instruments/settlement against payables (orders, invoices). Provider adapters live behind ports; no vertical UX here. |
| **Ledger** | Shared Business | `ledger` | Append-only accounting posts and balances. Orders/payments **emit** economic facts; ledger records them. Do not put POS UI or kitchen state in ledger. |
| **Inventory** | Shared Business | `inventory` | Quantity, location, and movement of stockable SKUs. Not hotel room inventory or restaurant table availability. |
| **Scheduling** | Shared Business | `scheduling` | Generic time slots, resources, and bookings-as-time (appointments, shifts, resource occupancy primitives). Industry language stays out of this module’s public model. |
| **Reservations** | **Product-Specific** | e.g. `restaurant-reservations` | Dining reservations (party size, table hold, waitlist) are **restaurant**. Hotel stays use hotel **Bookings**. Healthcare uses appointments (scheduling + healthcare contexts). Do **not** put “Reservation” entities in shared modules. |

### Anti-leak rules

1. Shared modules must not import `products/*` or product-specific module packages.
2. No shared entity named `Table`, `Menu`, `KitchenTicket`, `Room`, `HousekeepingTask`, `BarcodeScan` as a kernel concept.
3. Vertical UX labels (“Menu”, “Guest”, “Patient”) map at the product/BFF layer onto Party, Catalog, Order, Scheduling, etc.
4. Elevating a product concept into Shared Business requires an ADR showing **≥2 verticals** with the same ubiquitous language and invariants.

---

## 4. Core Platform Domains

Repository home: `modules/<name>` (future). Ownership: Platform Maintainers / Platform Architects.

### 4.1 `identity`

| Field | Definition |
| --- | --- |
| **Responsibility** | Principals, credentials, sessions, MFA hooks, SSO federation hooks. |
| **Public APIs (facade)** | Register/authenticate principal; manage credentials; issue/revoke sessions; resolve principal by id. |
| **Depends on** | None (kernel). Uses shared technical packages only (`errors`, `logger`, …). |
| **Ownership rules** | Must not store organization business profiles (that is `tenancy`). Must not embed RBAC policy evaluation (that is `rbac`). |
| **Used by** | All layers. |

### 4.2 `tenancy`

| Field | Definition |
| --- | --- |
| **Responsibility** | Organizations (tenants), locations/branches, memberships linking principals to orgs/locations. |
| **Public APIs** | Create/manage org; create locations; manage memberships; resolve tenant context. |
| **Depends on** | `identity` (principals). |
| **Ownership rules** | Every tenant-owned row in higher domains ultimately scopes to an organization (and optionally location) defined here. No industry fields (e.g. star rating, cuisine type) on org core—use product extensions/metadata with ADR. |
| **Used by** | All shared and product domains. |

### 4.3 `rbac`

| Field | Definition |
| --- | --- |
| **Responsibility** | Permissions, roles, policy evaluation (deny by default), optional location-scoped grants. |
| **Public APIs** | Define permission catalog entries; assign roles; `authorize(principal, permission, resourceContext)`. |
| **Depends on** | `identity`, `tenancy`. |
| **Ownership rules** | Permission strings stay `resource.action`. Product packs may *register* additional permissions; they must not bypass `authorize`. |
| **Used by** | Application services in all modules. |

### 4.4 `audit`

| Field | Definition |
| --- | --- |
| **Responsibility** | Immutable audit trail for security-sensitive and commercially sensitive actions. |
| **Public APIs** | `record(event)`; query audit by org/actor/resource (authorized). |
| **Depends on** | `tenancy`, `identity` (references only). |
| **Ownership rules** | Append-oriented; no silent deletes of audit facts. |
| **Used by** | All modules that mutate privileged state. |

### 4.5 `files`

| Field | Definition |
| --- | --- |
| **Responsibility** | Upload metadata, signed URL issuance, retention hooks, virus-scan ports. |
| **Public APIs** | Initiate upload; finalize; issue download URL; attach file refs to resource ids (opaque). |
| **Depends on** | `tenancy`, `identity`, `rbac` (for access). |
| **Ownership rules** | Stores blobs via infrastructure adapters; domain keeps metadata + ACL refs. No clinical-specific document types—products classify. |

### 4.6 `billing` (platform entitlements)

| Field | Definition |
| --- | --- |
| **Responsibility** | SaaS plans, subscriptions, entitlements that gate product packs and quotas. |
| **Public APIs** | Check entitlement; list plan features; record subscription state. |
| **Depends on** | `tenancy`. |
| **Ownership rules** | Distinct from customer **Payments** / **Ledger** (those are tenant commercial domains). Platform billing is Noventra↔tenant commercial relationship. |

### 4.7 `workflow`

| Field | Definition |
| --- | --- |
| **Responsibility** | Generic approval/state-machine primitives for cross-cutting processes. |
| **Public APIs** | Define workflow type; start instance; transition; query state. |
| **Depends on** | `tenancy`, `identity`, `rbac`. |
| **Ownership rules** | Process *definitions* for verticals may live in products; engine stays generic. |

### 4.8 `integrations`

| Field | Definition |
| --- | --- |
| **Responsibility** | Outbound/inbound adapter hosts (tax, SMS gateways, payment PSPs as ports, webhooks). |
| **Public APIs** | Register connector config; send via port; receive webhook normalized events. |
| **Depends on** | `tenancy`, `audit` (for sensitive connector changes). |
| **Ownership rules** | Adapters implement ports defined by shared domains (`payments`, `notifications`); integrations does not own Order/Payment invariants. |

---

## 5. Shared Business Domains

Repository home: `modules/<name>` (future). Ownership: Platform Maintainers with commercial-domain specialists. **Must remain industry-neutral.**

### 5.1 `parties`

| Field | Definition |
| --- | --- |
| **Responsibility** | Party master data: persons/organizations, contacts, addresses, relationships/roles (customer, supplier, patient-as-role, etc.). |
| **Public APIs** | Create/update party; add relationship; search within tenant; get by id. |
| **Depends on** | `tenancy`, `rbac`, `audit` (as needed), optionally `files`. |
| **Ownership rules** | No “Guest folio”, “Student enrollment”, or “Patient chart” aggregates here—those are product domains referencing `partyId`. |
| **Reuse** | All six verticals. |

### 5.2 `catalog`

| Field | Definition |
| --- | --- |
| **Responsibility** | Catalog items/services, variants, tax categories, list prices, availability flags as commercial definitions. |
| **Public APIs** | Manage catalog items; resolve price; query by tenant/location applicability. |
| **Depends on** | `tenancy`, `rbac`. |
| **Ownership rules** | Not a Menu, not a Course curriculum UI, not a Room type marketing page—those compose or extend via product modules. |
| **Reuse** | All verticals that sell or stock things/services. |

### 5.3 `orders`

| Field | Definition |
| --- | --- |
| **Responsibility** | Orders as commercial commitments: headers, lines, amounts, lifecycle (draft→committed→fulfilled/cancelled), references to parties and catalog items. |
| **Public APIs** | Create order; add lines; transition state; get order; list by tenant/party. |
| **Depends on** | `tenancy`, `parties`, `catalog`, `rbac`, `audit`. |
| **Ownership rules** | No kitchen station routing, no POS tender UI, no table number as a first-class kernel field. Optional opaque `channel` / `source` metadata allowed; vertical attributes via extension points/ADR. |
| **Reuse** | Restaurant checks, retail tickets, hotel charge orders, healthcare invoices, tuition orders, professional SOWs-as-orders—as appropriate compositions. |

### 5.4 `payments`

| Field | Definition |
| --- | --- |
| **Responsibility** | Payment intents/attempts, methods, capture/refund lifecycle against a payable reference (typically order or invoice id). |
| **Public APIs** | Create payment intent; capture; refund; get status. |
| **Depends on** | `tenancy`, `orders` (or payable port), `rbac`, `audit`, `integrations` (PSP adapters). |
| **Ownership rules** | Does not own double-entry books (that is `ledger`). Does not own tip-pooling restaurant rules (product). |
| **Reuse** | All paid verticals. |

### 5.5 `ledger`

| Field | Definition |
| --- | --- |
| **Responsibility** | Accounts, journal entries, postings; balances derived from posts. |
| **Public APIs** | Post entry; reverse entry; get account balance; list entries. |
| **Depends on** | `tenancy`, `rbac`, `audit`. Consumes facts from `orders`/`payments` via application services or events. |
| **Ownership rules** | Append-only posts; no UI concepts; no industry chart-of-accounts hardcoding beyond configurable accounts. |
| **Reuse** | All financial verticals. |

### 5.6 `inventory`

| Field | Definition |
| --- | --- |
| **Responsibility** | Stock items (linked to catalog where stockable), quantities per location, receipts, issues, adjustments, transfers. |
| **Public APIs** | Adjust stock; transfer; reserve quantity (soft); query on-hand. |
| **Depends on** | `tenancy`, `catalog`, `rbac`, `audit`. |
| **Ownership rules** | Not rooms, tables, or practitioner capacity—those are scheduling/product. |
| **Reuse** | Restaurant (ingredients), retail, healthcare supplies, education materials, professional parts as needed. |

### 5.7 `scheduling`

| Field | Definition |
| --- | --- |
| **Responsibility** | Resources (opaque resource refs), time ranges, bookings/appointments as schedule entries, conflict rules at a generic level. |
| **Public APIs** | Define resource; create schedule entry; cancel; query availability. |
| **Depends on** | `tenancy`, `parties` (optional attendee refs), `rbac`. |
| **Ownership rules** | Public model uses neutral terms (`ScheduleEntry`, `Resource`). **Forbidden in this module:** `DiningReservation`, `HotelBooking`, `HousekeepingSlot` types. Products wrap scheduling for industry UX. |
| **Reuse** | Healthcare appointments, education classes, professional consultations, hotel resource time, restaurant shift slots—not dining reservations as the shared entity. |

### 5.8 `notifications`

| Field | Definition |
| --- | --- |
| **Responsibility** | Notification intents, templates refs, delivery via channel ports (email/SMS/push). |
| **Public APIs** | Enqueue notification; render template; delivery status. |
| **Depends on** | `tenancy`, `identity`/`parties` (recipients), `integrations`. |
| **Ownership rules** | Content templates may be product-specific; dispatch engine is shared. |

### 5.9 `reporting`

| Field | Definition |
| --- | --- |
| **Responsibility** | Controlled query/export primitives, report definitions, async export jobs. |
| **Public APIs** | Run report; schedule export; authorize dataset access. |
| **Depends on** | `tenancy`, `rbac`, read models from other domains (via published read contracts). |
| **Ownership rules** | Must never bypass tenant predicates. No cross-tenant “god queries” without break-glass + audit. |

---

## 6. Product-Specific Domains

Repository home: preferably `modules/<vertical>-*` **or** packages owned under `products/<vertical>/` composed into apps. They **may** depend on core + shared; they **must not** be depended on by core/shared.

### 6.1 Restaurant (`products/restaurant`)

| Domain / context | Responsibility | May use | Must not redefine |
| --- | --- | --- | --- |
| **Floor / Tables** | Dining tables, sections, seating state | tenancy, scheduling (optional for shifts) | inventory “as tables” |
| **Reservations** | Guest dining reservations, waitlist, covers | parties, scheduling (optional), notifications | shared entity named Reservation in `scheduling` |
| **Menu presentation** | Menus, categories, channel display | catalog | replace catalog |
| **Kitchen operations** | KDS routing, prep stations, ticket display | orders (as source), notifications | orders lifecycle owned by kitchen |
| **Recipes / COGS** (optional) | Recipe graphs onto inventory SKUs | catalog, inventory | — |

### 6.2 Hotel (`products/hotel`)

| Domain / context | Responsibility | May use |
| --- | --- | --- |
| **Rooms** | Room types, room instances, housekeeping state | tenancy, catalog (rate plans as catalog/services), inventory only if minibar SKUs |
| **Bookings** | Stay bookings, allocations | parties, scheduling (optional), orders, payments, ledger |
| **Folio** | Guest folio presentation | orders, payments, ledger |
| **Housekeeping** | Task boards, room status workflows | workflow, rooms |

### 6.3 Retail POS (`products/retail-pos`)

| Domain / context | Responsibility | May use |
| --- | --- | --- |
| **POS session / till** | Register open/close, cash drawer | identity, tenancy, rbac |
| **POS sale UX** | Scanning, quick pay flows | catalog, orders, payments, inventory |
| **Returns** | Return/exchange flows | orders, payments, inventory, ledger |
| **Barcode operations** | Device/scan normalization | catalog, inventory |

### 6.4 Healthcare (`products/clinic`)

| Domain / context | Responsibility | May use |
| --- | --- | --- |
| **Encounters / charting** | Clinical encounter records (regulated) | parties, files, audit, rbac |
| **Appointments UX** | Clinic-specific appointment semantics | scheduling, parties, notifications |
| **Care protocols** | Vertical care pathways | workflow |

### 6.5 Education (`products/school`)

| Domain / context | Responsibility | May use |
| --- | --- | --- |
| **Enrollment / academic structure** | Terms, courses, sections, enrollment | parties, scheduling, catalog (programs/fees) |
| **Fee collection UX** | Tuition/fees presentation | orders, payments, ledger |
| **Guardian portals** | Relationship-specific UX | parties, notifications, rbac |

### 6.6 Professional Services (`products/professional-services`)

| Domain / context | Responsibility | May use |
| --- | --- | --- |
| **Engagements / matters** | Client engagement lifecycle | parties, orders, workflow |
| **Time & billing UX** | Time entry presentation | scheduling (time blocks), orders, ledger |
| **Deliverables** | Artifact tracking | files, workflow |

---

## 7. Dependency rules (normative)

```text
Product-Specific  →  Shared Business  →  Core Platform  →  technical packages
       ✗──────────────────────────────↵ (forbidden)
Shared Business   ✗→ Product-Specific (forbidden)
Core Platform     ✗→ Shared Business or Product-Specific (forbidden)
```

Additional rules:

1. Depend only on **public facades**, never another module’s `infrastructure`.
2. Prefer **domain events** for side effects across modules (see [eventing.md](eventing.md)).
3. No circular dependencies between modules.
4. Database tables are owned by one module; cross-module access via APIs/events, not foreign-key sprawl without ADR.
5. Product packs register entitlements via `billing`; they do not fork identity/tenancy.

---

## 8. Ownership summary

| Layer | Default code owners | May approve boundary exceptions |
| --- | --- | --- |
| Core Platform | `@noventra/platform-maintainers` + architects | Platform architects via ADR |
| Shared Business | Platform maintainers + domain co-owners | Platform architects via ADR |
| Product-Specific | Product team + platform maintainers (API use review) | Product ADR if elevating to shared |

Every module README (when created) must state: layer, facade exports, allowed dependency list, and explicit non-goals.

---

## 9. Mapping stakeholder language → NBCP

| Stakeholder says | NBCP uses |
| --- | --- |
| Customer / Guest / Patient / Student / Client | **Party** (+ relationship) |
| Product / Item / SKU / Service offering | **Catalog item** |
| Menu | Restaurant **Menu presentation** over catalog |
| Order / Check / Ticket / Invoice | **Order** (product UX may rename) |
| Pay / Tender / Checkout | **Payments** (+ POS UX) |
| Books / Accounting | **Ledger** |
| Stock | **Inventory** |
| Appointment / Class slot | **Scheduling** |
| Dining reservation | Restaurant **Reservations** |
| Hotel booking / stay | Hotel **Bookings** |

---

## 10. Build order (guidance)

Suggested implementation sequence when Phase 1+ begins (not a commitment to dates):

1. Core: `identity` → `tenancy` → `rbac` → `audit`
2. Shared: `parties` → `catalog` → `orders` → `payments` → `ledger` → `inventory`
3. Shared: `scheduling`, `notifications`, `reporting` as needed by the first vertical slice
4. First vertical (likely restaurant): product domains only after the shared slice it needs exists
5. Platform `billing` / entitlements early enough to gate packs

---

## 11. Related documents

- [ADR-0002: Domain Map](../adr/0002-domain-map.md)
- [ADR-0001: Technology foundation](../adr/0001-platform-technology-foundation.md)
- [Modular monolith](modular-monolith.md)
- [Tenancy model](tenancy-model.md)
- [Glossary](../glossary.md)
- [Product compositions](../product/README.md)
