# Reporting Module — Design

| Field | Value |
| --- | --- |
| **Module** | `reporting` (`modules/reporting` — future implementation) |
| **Layer** | Shared Business ([ADR-0002](../../adr/0002-domain-map.md)) |
| **Stack** | NestJS + Prisma ([ADR-0001](../../adr/0001-platform-technology-foundation.md)) |
| **Structure** | [Module standard](../../architecture/module-standard.md) |
| **Status** | Design only — no implementation in this document |
| **Last updated** | 2026-07-14 |

**Normative companions:** [Business capability map](../../architecture/business-capability-map.md) · [Domain map §5.9](../../architecture/domain-map.md) · [Event contracts / ADR-0003](../../architecture/event-contracts.md) · [ADR-0004](../../adr/0004-event-retention-replay-rebuild.md) · [ADR-0005](../../adr/0005-financial-truth-and-projection-ownership.md) (Ledger vs Reporting ownership) · [Tenant access model](../../architecture/tenant-access-model.md) · Shared designs: Parties, Catalog, Orders, Inventory, Ledger, Payments, Scheduling, Notifications

---

## 1. Purpose

The **Reporting** module is NBCP’s **reusable reporting and analytics domain**: tenant-scoped **datasets**, **projections / read models**, **report definitions**, **materialized views**, and **exports**.

It answers: *What analytical views and exportable results can an authorized principal run for this organization (and optional location), built from facts that already happened elsewhere?*

It does **not** answer: *What is the system of record for orders, payments, stock, or accounting?* Those truths live in their owning modules. Reporting **consumes events** (and optional approved read APIs) to build **eventually consistent** read models — never becomes the write authority.

### Must support (neutral analytics — not vertical report engines)

| Vertical | Reporting usage |
| --- | --- |
| Restaurant reporting | Sales, comps, ingredient usage projections — product may add menu/table dims via event payloads/pack fields |
| Hotel reporting | Occupancy-adjacent commercial metrics from booking product events + order/payment facts |
| Retail reporting | Sales, stock movement summaries, margins |
| Healthcare reporting | Billable volume / collection — clinical KPIs stay in product marts |
| Education reporting | Tuition collection, enrollment commercial metrics |
| Professional-services reporting | Utilization-adjacent revenue from orders/payments + product session events |

Same Reporting ARs for all: Definition, Dataset/Projection, ExportJob — not `RestaurantZReport` aggregates in Core.

### Explicit non-goals / must NOT own

| Forbidden as source of truth | Owner |
| --- | --- |
| **Orders** | Orders module |
| **Payments** | Payments module |
| **Inventory balances** | Inventory module |
| **Ledger truth** (posted journals/balances) | Ledger module |
| Cross-tenant platform warehouses without break-glass | Ops/Break-glass + Audit |

---

## 2. Why Reporting must not own operational truths

| Concern | Why not Reporting | Correct flow |
| --- | --- | --- |
| **Orders** | Commercial commitment lifecycle and snapshots are Orders invariants | Reporting projects `orders.order.committed` into sales facts |
| **Payments** | Capture/refund truth is Payments | Project `payments.capture.succeeded` into collections facts |
| **Inventory balances** | On-hand/reserved truth is Inventory | Project movements into stock analytics; drill-through may call Inventory query API |
| **Ledger truth** | Append-only posts are Ledger | Trial balance / GL reports read Ledger APIs or project `ledger.journal.posted` for dashboards — Ledger remains authoritative for disputes |

- **Rebuild rule:** Any reporting table must be **rebuildable** from event logs / source modules per [ADR-0004](../../adr/0004-event-retention-replay-rebuild.md). If Reporting disagrees with Inventory/Ledger/Orders/Payments, **source modules win** ([ADR-0005](../../adr/0005-financial-truth-and-projection-ownership.md)).

---

## 3. Ubiquitous language

| Term | Meaning |
| --- | --- |
| **Dataset** | Named, versioned logical collection of facts (e.g. `sales_order_facts`) |
| **Projection** | Process/write model that updates a dataset from domain events |
| **Materialized view** | Stored physical table/roll-up optimized for queries (may be DB MV or app-maintained table) |
| **Report definition** | Declarative description: dataset, filters, columns, aggregations, authorization permission |
| **Export** | Async job producing a file (CSV/PDF/…) from a definition + parameters |
| **Read model** | Query-optimized representation — not a write aggregate for other domains |

---

## 4. Aggregates

| Aggregate | Responsibility |
| --- | --- |
| **ReportDefinition** | Metadata for a runnable report |
| **ExportJob** | Async export lifecycle |
| **DatasetRegistration** | Catalog of datasets/projections owned by Reporting (not row-level facts as DDD “entities” in the business sense) |

**Fact tables / MVs** are persistence for projections — treated as **infrastructure read models** updated only by Reporting projectors, not as independently mutated aggregates from products.

```text
ReportDefinition (AR)
├── organizationId? (null = platform template)
├── key, name, datasetKey
├── parameterSchema, columnSpec
├── requiredPermission
└── status

ExportJob (AR)
├── organizationId
├── reportDefinitionId / inline spec
├── parameters snapshot
├── status: pending|running|succeeded|failed
├── artifactFileRef?
└── requestedByPrincipalId

DatasetRegistration (AR / config)
├── datasetKey, version, schema description
└── owningProjector name
```

---

## 5. Aggregates (detail)

### 5.1 ReportDefinition

**Invariants:**

1. `key` unique per organization (or platform).
2. Must reference a registered `datasetKey`.
3. `requiredPermission` is an RBAC permission key (e.g. `reporting.sales.read`).
4. Definitions do not embed SQL from untrusted clients (allowlist builders / parameterized engines only).

### 5.2 ExportJob

**Invariants:**

1. Tenant-scoped; parameters snapshotted at request.
2. Artifact access requires same org + permission as report.
3. Terminal statuses immutable; retry = new job.
4. Retention policy on artifacts (delete after N days).

### 5.3 Projections (process, not arbitrary product logic)

Projectors:

- Subscribe to **public event contracts** of shared/core modules ([ADR-0003](../../adr/0003-event-contracts-and-outbox.md)).
- Are **idempotent** on `eventId`.
- Write **only** `reporting_*` tables.
- Never write `orders_*`, `payments_*`, `inventory_*`, `ledger_*`.

---

## 6. Entities

| Entity | Parent | Role |
| --- | --- | --- |
| **ExportArtifact** | ExportJob | file metadata, checksum, expiresAt |
| **ReportSchedule** (optional) | ReportDefinition | cron-like enqueue of ExportJob |

Fact rows are not classic DDD entities exposed on the facade; they are query results.

---

## 7. Value objects

| Value object | Description |
| --- | --- |
| **ReportDefinitionId** / **ExportJobId** / **DatasetKey** | Ids / keys |
| **OrganizationId** / **LocationId** | Mandatory tenant filter dims |
| **PrincipalId** | Requestor |
| **ReportParameters** | Date range, locationId?, partyId?, … validated JSON |
| **JobStatus** | pending \| running \| succeeded \| failed \| cancelled |
| **PermissionKey** | RBAC permission required to run |
| **FileRef** | Object storage pointer via Files port |

---

## 8. Domain events (contracts)

Reporting **consumes** far more than it produces.

### 8.1 Consumed events (illustrative minimum)

| Source | Events → Reporting fact use |
| --- | --- |
| **Orders** | `committed` / `fulfilled` / `cancelled` → sales facts |
| **Payments** | `capture.succeeded` / `refund.succeeded` → collections facts |
| **Inventory** | `received` / `issued` / `adjusted` / `transferred` → movement facts |
| **Ledger** | `journal.posted` / `reversed` → financial dashboard facts (non-authoritative) |
| **Scheduling** | `entry.confirmed` / `cancelled` → utilization facts |
| **Parties** | `party.created` / `classification.*` → dimension sync |
| **Catalog** | `item.*` / `price.changed` → dimension sync |
| **Tenancy** | org/location lifecycle → dim sync |
| **Product events** (optional) | Via **apps composer** or future product mart modules — Reporting Core package still does not import `products/*`; product-specific datasets live in product reporting packs that follow the same write-to-`reporting_*` or separate product DB with org filter |

### 8.2 Produced events

| Event `type` | When | Consumers |
| --- | --- | --- |
| `reporting.export.completed` | Export ready | Notifications (link), Audit |
| `reporting.export.failed` | Export failed | Ops, Audit |
| `reporting.definition.published` | Definition activated | Audit |
| `reporting.projection.lag` (optional ops) | Consumer lag metrics | Observability |

---

## 9. Public APIs

Authorize after tenant context: report permission on definition + `reporting.export.request`.

### Commands

| API | Behavior |
| --- | --- |
| `publishReportDefinition` / `retireReportDefinition` | Definition lifecycle |
| `registerDataset` (platform) | Dataset catalog |
| `runReportQuery({ definitionKey, organizationId, parameters })` | Sync query (bounded size) |
| `requestExport({ definitionKey, parameters })` | Create ExportJob |
| `rebuildDataset({ datasetKey, organizationId?, fromEventId? })` | Ops rebuild |

### Queries

| API | Behavior |
| --- | --- |
| `getExportJob` / `listExportJobs` | Status + download (signed URL) |
| `listReportDefinitions` | Available reports for org |
| `getDatasetFreshness({ datasetKey, organizationId })` | Lag / last event |

### HTTP (illustrative)

- `GET /v1/organizations/:organizationId/reports`
- `POST /v1/organizations/:organizationId/reports/:key/query`
- `POST /v1/organizations/:organizationId/reports/:key/exports`
- `GET /v1/organizations/:organizationId/exports/:jobId`

---

## 10. How Reporting consumes events and builds read models

```text
Shared/Core module transaction
  → outbox event (ADR-0003)
       → bus/worker
            → reporting projector (idempotent on eventId)
                 → UPSERT reporting_fact_* / refresh MV
                      → ReportDefinition queries facts
                           → ExportJob reads facts → Files
```

**Example — sales by day/location:**

1. `orders.order.committed` received.  
2. Projector upserts `reporting_sales_order_facts` with organizationId, locationId, orderId, totals, partyId, committedAt.  
3. Nightly job refreshes `reporting_sales_daily_mv`.  
4. Report `sales.daily` queries the MV with **forced** `WHERE organization_id = :org`.

**Ledger drill-down:** Dashboard shows projected revenue; “source document” links to Orders/Payments/Ledger **facade gets** — not Reporting as legal books.

---

## 11. Dependencies

```text
reporting → tenancy, rbac
reporting → event contracts of shared domains (orders, payments, inventory, ledger, …)  [consumer deps]
reporting → files port (export artifacts)
reporting ↛ writes to source modules
orders | payments | inventory | ledger | …  ↛  reporting   # no reverse deps
reporting ↛ products/*
```

| Depends on | Usage |
| --- | --- |
| **Tenancy / RBAC** | Tenant scope + authorize (Core — required) |
| **Shared domain events** | Projection inputs (one-way consumer) |
| **Files** (optional) | Export storage |

Matches: **Reporting → Core**; **consumes shared events**; **no reverse dependencies**; **no product package deps**. Product-specific reports are either parameterized definitions over shared facts or separate product packs writing their own datasets without modifying shared module write APIs.

---

## 12. Database ownership

Reporting owns `reporting_*` tables (and Reporting-managed MVs).

| Table (examples) | Contents |
| --- | --- |
| `reporting_definitions` | ReportDefinition rows |
| `reporting_export_jobs` | ExportJob rows |
| `reporting_datasets` | DatasetRegistration |
| `reporting_processed_events` | consumer group + eventId idempotency |
| `reporting_sales_order_facts` | Projected order facts |
| `reporting_payment_facts` | Projected payment facts |
| `reporting_inventory_movement_facts` | Projected movements |
| `reporting_*_daily_mv` | Rollups |

**Tenant ownership rules:**

1. Every fact/export/definition-run is constrained by `organization_id`.  
2. Query engine **injects** tenant predicate; clients cannot omit org.  
3. Location filters optional but never cross-org.  
4. Platform operators use break-glass + Audit — not normal API.  
5. No foreign writes into source module tables.

---

## 13. Audit requirements

| Action | Requirement |
| --- | --- |
| Export requested/completed | Outbox → Audit (PII/financial export sensitivity) |
| Definition published | Audit |
| Rebuild dataset | Audit (ops) |
| Metadata | definition key, parameters (redact sensitive), artifact id — not full result dumps |

---

## 14. Event contract summary

- **Consumes:** shared/core public events (idempotent)  
- **Produces:** export/definition lifecycle events  
- **Never** requires Orders/Payments/Inventory/Ledger to import Reporting  

---

## 15. Seed permissions (illustrative)

| Permission | Intent |
| --- | --- |
| `reporting.sales.read` | Sales reports |
| `reporting.inventory.read` | Stock analytics |
| `reporting.finance.read` | Payment/ledger dashboards |
| `reporting.export.request` | Exports |
| `reporting.definition.manage` | Admin definitions |

Pack-specific permissions register via RBAC catalog.

---

## 16. Testing expectations

| Focus | Assertion |
| --- | --- |
| Tenant injection | Query without org impossible |
| Idempotent projection | Replay eventId → no double count |
| Rebuild | Facts match re-projected event stream |
| Anti-ownership | No APIs that `UPDATE orders_*` |
| DAG | Source modules do not import `@nbcp/reporting` |
| AuthZ | Missing report permission → deny |

---

## 17. Implementation roadmap (non-binding)

1. Dataset registry + processed_events + Orders sales facts projector  
2. ReportDefinition + sync query + ExportJob + Files  
3. Payments + Inventory projectors  
4. Ledger dashboard projections  
5. Scheduling utilization facts  
6. Product pack datasets (separate packages)  

---

## 18. Related documents

- [business-capability-map.md](../../architecture/business-capability-map.md) §10  
- [domain-map.md](../../architecture/domain-map.md) §5.9  
- [orders](../orders/design.md) · [payments](../payments/design.md) · [inventory](../inventory/design.md) · [ledger](../ledger/design.md)  
- [ADR-0001](../../adr/0001-platform-technology-foundation.md) / [0002](../../adr/0002-domain-map.md) / [0003](../../adr/0003-event-contracts-and-outbox.md)  
- [module-standard.md](../../architecture/module-standard.md) · [audit/design.md](../audit/design.md)
