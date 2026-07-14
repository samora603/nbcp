# ADR-0002: NBCP Domain Map

- **Status:** Accepted
- **Date:** 2026-07-14
- **Deciders:** Noventra platform architecture
- **Tags:** domain, boundaries, reuse, ddd, modular-monolith

## Context

NBCP must power multiple vertical products—Restaurant, Hotel, Retail POS, Healthcare, Education, and Professional Services—without becoming a restaurant codebase that is awkwardly generalized later.

Prior architecture work ([ADR-0001](0001-platform-technology-foundation.md), modular monolith docs, product notes) established *how* we build (TypeScript modular monolith, `modules/` vs `products/`) but did not lock *what* the bounded contexts are or how contested terms (Customer vs Party, Product vs Catalog, Orders vs Payments vs Ledger, Scheduling vs Reservations) are placed.

An architecture review of the repository (Phase 0.1) identified the missing domain map as a **critical** prerequisite before feature development. Without it, the first vertical (restaurant) is likely to leak dining concepts into reusable modules and destroy cross-vertical reuse.

## Decision

We adopt the definitive domain map documented in [`docs/architecture/domain-map.md`](../architecture/domain-map.md).

### Layering

1. **Core Platform Domains** — identity, tenancy, rbac, audit, files, platform billing/entitlements, workflow, integrations.
2. **Shared Business Domains** — parties, catalog, orders, payments, ledger, inventory, scheduling, notifications, reporting.
3. **Product-Specific Domains** — vertical contexts only (e.g., restaurant tables/reservations/kitchen/menu presentation; hotel rooms/bookings/housekeeping; retail POS/returns/barcodes; healthcare encounters; education enrollment; professional engagements).

Dependency direction is strictly:

`Product-Specific → Shared Business → Core Platform → technical packages`

Core and shared modules must never depend on product-specific modules.

### Placement of contested terms

| Term | Placement | Rationale |
| --- | --- | --- |
| **Party** | Shared Business (`parties`) | Industry-neutral master for people/orgs dealt with by a tenant. |
| **Customer** | Alias/role of Party | Avoids a second master-data module; UIs may say Customer. |
| **Catalog** | Shared Business (`catalog`) | Neutral sellable/stockable definitions. |
| **Product** | Alias of catalog item | Avoids duplicate `products` domain colliding with `products/` compositions. |
| **Orders** | Shared Business (`orders`) | Cross-vertical commercial commitment aggregate. |
| **Payments** | Shared Business (`payments`) | Payment lifecycle against payables; PSP adapters via ports. |
| **Ledger** | Shared Business (`ledger`) | Append-only accounting; separated from payment capture and POS UX. |
| **Inventory** | Shared Business (`inventory`) | SKU quantities/movements—not rooms or tables. |
| **Scheduling** | Shared Business (`scheduling`) | Neutral resources and time entries. |
| **Reservations** | **Product-Specific (Restaurant)** | Dining reservations are not a shared ubiquitous language with hotel bookings or clinical appointments. |

### Anti-leak policy

Shared/core modules must not introduce restaurant (or other vertical) types such as Menu, Dining Table, Kitchen Ticket, Room, or Housekeeping Task. Elevating any product concept into Shared Business requires a new ADR demonstrating reuse across **at least two** verticals with shared invariants and language.

## Consequences

### Positive

- **Maximizes reuse:** All six verticals compose the same identity, tenancy, RBAC, party, catalog, order, payment, ledger, and inventory kernels instead of forking per industry.
- **Protects the kernel:** Restaurant can be first to market without becoming the accidental center of the model.
- **Clarifies money flow:** Orders (commitment) → Payments (settlement attempts) → Ledger (accounting facts) prevents “god modules” that mix POS UX, kitchen state, and accounting.
- **Clarifies people and things:** Party vs Customer and Catalog vs Product remove parallel models and collision with the `products/` directory.
- **Clarifies time:** Scheduling stays generic; Reservations/Bookings/Appointments remain vertical languages that wrap or reference schedule primitives.
- **Gives ownership teeth:** Layer + facade + dependency rules can be enforced with generators and boundary lint as modules appear.
- **Aligns SaaS readiness:** Platform `billing` (entitlements) remains distinct from tenant `payments`/`ledger`.

### Negative / Trade-offs

- **Indirection for product UX:** Restaurant “Menu” and “Guest” are mappings over Catalog and Party—slightly more composition work upfront.
- **Discipline required:** Teams must resist stuffing vertical fields into shared aggregates “just this once.”
- **Orders generality:** A shared Order model must stay intentionally thin; rich vertical workflows (KDS, folio UX) live outside `orders`.
- **Professional Services folder** is planned (`products/professional-services`) and may not exist on disk until scaffolded—map precedes folder where needed.

### Follow-ups

1. Update glossary terms for Order, Payment, Schedule Entry, Reservation (product), Booking (hotel).
2. Align product notes (especially restaurant) to remove “reservations” as a shared kernel dependency.
3. When Phase 1 starts: scaffold modules only in the order guided by the domain map; add boundary lint.
4. Future ADRs: detailed RBAC permission catalog; auth provider; event contract standards referencing these domain names.

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| Build restaurant app first, extract platform later | Historically produces irreversible dining-centric schemas and poor reuse. |
| Single “CRM” module owning customers + orders + payments | God context; weak boundaries; hard to entitlement-gate and extract. |
| Put Reservations in Shared Business | False friend across hotel bookings and clinical appointments; pollutes ubiquitous language. |
| Merge Payments into Ledger | Confuses payment-provider lifecycle with accounting posts; hurts PSP integration and refunds. |
| Merge Orders into Inventory | Not all orders are stocked; breaks services-heavy verticals (healthcare, professional services, education). |
| Separate Customer module distinct from Party | Duplicate masters; role/relationship on Party is sufficient. |
| Microservice-per-domain at the start | Rejected by ADR-0001; map still applies inside the modular monolith. |

## Why this maximizes reuse across future verticals

Reuse comes from **stable, industry-neutral invariants**:

- Every vertical needs secure multi-tenant identity and authorization → Core.
- Every vertical deals with people/orgs, sellable offerings, commitments, money movement, and often stock or time → Shared Business with neutral names.
- Only the last mile differs (tables vs rooms vs tills vs encounters vs enrollment vs engagements) → Product-Specific.

By freezing that split **before** schemas exist, NBCP can ship restaurant features as compositions of shared domains rather than as the platform’s hidden default. Hotel, retail, healthcare, education, and professional services then plug into the same facades instead of competing forks.

## References

- [`docs/architecture/domain-map.md`](../architecture/domain-map.md) (normative detail)
- [`docs/architecture/modular-monolith.md`](../architecture/modular-monolith.md)
- [`docs/architecture/tenancy-model.md`](../architecture/tenancy-model.md)
- [`docs/vision.md`](../vision.md)
- [ADR-0001](0001-platform-technology-foundation.md)
- `.cursor/rules/engineering.md` (module independence / product isolation)
