# Glossary

Shared language for NBCP. Use these terms consistently in code, APIs, docs, and conversations.

| Term | Definition |
| --- | --- |
| **NBCP** | Noventra Business Core Platform — the shared platform monorepo and capabilities. |
| **Platform kernel** | Cross-product modules (identity, tenancy, rbac, audit, billing primitives, etc.). |
| **Module** | A bounded capability under `modules/` with domain, application, and infrastructure layers. |
| **Package** | A shared technical library under `packages/` (config, UI, contracts, telemetry). |
| **Product** | A vertical composition under `products/` (e.g., Restaurant ERP, Hotel HMS). |
| **App** | A deployable runtime under `apps/` (API host, worker, web shell). |
| **Organization (Org / Tenant)** | The primary multi-tenant boundary — a customer company using NBCP-powered software. |
| **Location / Branch** | Optional subdivision within an organization (store, property, campus). |
| **Membership** | A user’s relationship to an organization (and optionally a location). |
| **Principal** | An authenticated actor (user or service) making a request. |
| **Permission** | A resource-action entitlement string (e.g., `inventory.stock.adjust`). |
| **Role** | A named set of permissions assigned within a tenant context. |
| **Entitlement** | A plan- or license-gated capability for an organization. |
| **Party** | A person or organization entity in CRM-style master data (canonical module: `parties`). |
| **Customer** | Stakeholder term for a Party (or Party relationship) in a buying context — **classification** on Party (`customer`), not a separate module. See [parties design](modules/parties/design.md). |
| **Supplier / Vendor / Employee** | Party classifications (`supplier`, `vendor`, `employee`) on the Parties module — not separate modules. |
| **Catalog / Catalog item** | A sellable or stockable item/service definition (canonical module: `catalog`). Stakeholder “product” usually means catalog item. |
| **Order** | A commercial commitment (lines, amounts, lifecycle) shared across verticals (canonical module: `orders`). Product entities (bookings, encounters, enrollments) reference `orderId` — they do not live inside Orders. See [orders design](modules/orders/design.md). |
| **Payment** | Capture/refund lifecycle for settling a payable such as an order (canonical module: `payments`). Does not own chart of accounts or journal entries — those are Ledger. See [payments design](modules/payments/design.md). |
| **Ledger** | Append-oriented accounting posts and balances (canonical module: `ledger`). Corrections are reversals only. Card/cash/gateway flows belong in Payments — not Ledger. See [ledger design](modules/ledger/design.md). |
| **Inventory** | Stock quantities and movements for stockable SKUs — not rooms or dining tables (canonical module: `inventory`). Products correlate via `externalRef` / movement ids. See [inventory design](modules/inventory/design.md). |
| **Scheduling** | Industry-neutral resources and time entries (canonical module: `scheduling`). Owns resources, availability, slots/allocations — not Reservation/Booking/Appointment/Enrollment aggregates. See [scheduling design](modules/scheduling/design.md). |
| **Reservation** | Restaurant-specific dining reservation context — **not** a shared-business / Scheduling aggregate. |
| **Booking** | Hotel-specific stay booking context — product domain; may use scheduling/orders. |
| **Domain map** | Authoritative split of Core Platform, Shared Business, and Product-Specific domains — see `docs/architecture/domain-map.md`. |
| **Domain event** | A significant business occurrence emitted by a module. |
| **Notification** | Dispatch of a templated message on a channel (email/SMS/push). Campaigns and vertical reminders are product triggers — not Notifications aggregates. See [notifications design](modules/notifications/design.md). |
| **Reporting** | Tenant-scoped projections, report definitions, and exports built from other domains’ events — not the system of record for orders/payments/inventory/ledger. See [reporting design](modules/reporting/design.md). |
| **Outbox** | Reliable pattern for publishing events after durable commits. |
| **ADR** | Architecture Decision Record — accepted/rejected architectural choice. |
| **RFC** | Request for Comments — design proposal before a final ADR. |
| **Modular monolith** | Single deployable system with strict internal module boundaries. |
| **Bounded context** | DDD term for a linguistic and model boundary around a capability. |

Update this glossary whenever a new domain term is introduced in an ADR, module README, or public API.
