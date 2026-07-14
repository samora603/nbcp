# Shared Domain Implementation Package — Parties

**Status:** Implemented (S1) — see [`@nbcp/parties`](../../modules/parties/)  
**Shared milestone:** **S1** ([bootstrap-checklist.md](bootstrap-checklist.md))  
**Layer:** Shared Business ([ADR-0002](../adr/0002-domain-map.md) · [domain-map.md](../architecture/domain-map.md) §5.1)  
**Design authority:** [parties/design.md](../modules/parties/design.md)  
**Kernel gate:** [kernel-completion-report.md](../reviews/kernel-completion-report.md) — **Proceed to Shared Domains**  
**Catalogs:** [event-catalog.md](../reference/event-catalog.md) · [permission-catalog.md](../reference/permission-catalog.md)  
**Policy:** ADR-0001…0006 · [tenant-access-model.md](../architecture/tenant-access-model.md) · [module-standard.md](../architecture/module-standard.md)  
**Last updated:** 2026-07-14  

This package defines **implementation scope** for the first Shared Domain after Core Kernel completion. It deliberately omits code, HTTP/API contracts, persistence schemas, and framework choices. Implementers follow ADR-0001 stack decisions in a later implementation PR without contradicting this package or the Parties design.

---

## Purpose

**Parties** is NBCP’s **canonical ownership model** for business actors within a tenant. It is the durable master-data home for:

* **Customers** (as a classification on a Party — not a separate module)  
* **Suppliers** (and related vendor classifications — not separate modules)  
* **Internal business parties** (e.g. employees as party classifications; optional Identity principal link)  
* **Contact information** (channels, addresses, lightweight contact persons, relationships)  
* **Party lifecycle** (draft → active → inactive / merged / deleted)

Downstream Shared and Product modules **reference `partyId` only**. They must not invent parallel customer/supplier SoRs.

**Kernel demo path implication:** Shared work starts here only because M6 is complete. Core packages must remain free of Parties imports (Identity / Tenancy / RBAC independence preserved).

---

## Domain Responsibilities

### What Parties owns

| Ownership | Description |
| --- | --- |
| **Party master data** | Tenant-scoped individuals and counterparty organizations (party *kind*), display/legal naming, lifecycle status |
| **Classifications** | Role keys on a party (`customer`, `supplier`, `vendor`, `employee`, and registered extensions) — including multi-classification |
| **Contact methods** | Communication channels (email, phone, …) and postal addresses owned by the party |
| **Contact persons** | Lightweight named contacts attached to a party when they are not themselves a first-class Party |
| **Relationships** | Explicit edges between parties in the same tenant (`contact_of`, `subsidiary_of`, …) |
| **Principal linkage** | Optional, unique-per-tenant link from a Party to an Identity `principalId` (employee/portal cases) |
| **Producer events** | Catalog `parties.*` types published via transactional outbox |
| **Authorization surface** | Mutations/queries require Tenancy context + RBAC checks using Parties permission keys (host or application layer) |

### What Parties does **not** own

| Non-ownership | Belongs to |
| --- | --- |
| Login, credentials, sessions | **Identity** |
| Tenant org / membership / invitation | **Tenancy** |
| Permission evaluation / role templates | **RBAC** |
| Append-only security trail store | **Audit** (Parties emits; Audit projects / Shared may also `record`) |
| Sellable items, prices, tax categories | **Catalog** |
| Commercial commitments / order lines | **Orders** |
| Payment intents / captures / refunds | **Payments** |
| Posted journals / balances | **Ledger** |
| Stock movements / reservations of inventory | **Inventory** |
| Analytics marts / rebuildable reporting facts | **Reporting** |
| Guest folio, patient chart, student enrollment, dining reservation UX | **Product** modules (reference `partyId`) |
| SaaS tenant `Organization` aggregate | **Tenancy** (never conflate with “organization” party kind) |

### Non-goals

* Creating separate Customer / Supplier / Employee **modules** or aggregate roots  
* Industry-required fields (MRN, folio number, student id) on Party — those stay in product modules keyed by `partyId`  
* Replacing RBAC membership with party classifications  
* Cross-tenant party visibility or global CRM without tenant scope  

---

## Core Concepts

### Party

Canonical **tenant-owned business actor**. Exactly one Tenancy `organizationId` owns each party.

| Aspect | Rule |
| --- | --- |
| **Kinds** | `individual` \| `organization` (counterparty company — not the tenancy tenant) |
| **Identity** | Opaque `partyId` is the only legal external reference |
| **Mutability** | Kind immutable after create (migrate only via explicit future use case / ADR) |
| **Reference rule** | Orders, Catalog affinities, Payments payees, Product charts — store `partyId`, not denormalized CRM copies as SoR |

### Customer

A Party that holds the **`customer`** classification (`PartyRoleKey`). **Not** a separate aggregate or module. A party may also hold other classifications simultaneously.

### Supplier

A Party that holds the **`supplier`** classification. **`vendor`** may coexist as a related/synonym classification per product convention; both remain classifications on Party, not separate SoRs.

### Contact Method

Owned communication or address data on a Party:

| Form | Meaning |
| --- | --- |
| **Contact channel** | Email, phone, mobile, fax, other — value + primary/verified flags |
| **Postal address** | Structured address with usage (billing / shipping / legal) |
| **Contact person** | Lightweight named contact under a party (not necessarily its own `partyId`) |
| **Relationship** | First-class link to another Party when the contact must itself be searchable/orderable |

Primary email uniqueness / login-eligible channel policy is tenant-scoped (see design invariants); Parties enforces platform rules without owning Identity credentials.

### Party Status

Lifecycle status of a Party:

| Status | Meaning |
| --- | --- |
| `draft` | Incomplete; may be hidden from operational search |
| `active` | Normal commercial use |
| `inactive` | Retained; disabled for **new** business relationships/orders |
| `merged` | Absorbed into a surviving party (merge model) |
| `deleted` | Soft-deleted; no new business; historical refs remain valid |

Status transitions emit corresponding catalog events (`activated`, `inactivated`, `deleted`, `merged` as applicable).

### Related concepts (required clarity)

| Concept | Meaning |
| --- | --- |
| **Internal business party** | Typically `employee` classification; optional `principalId` link for portal/self-service — still a Party, not a Tenancy membership |
| **Organization party** | Counterparty company (`kind = organization`) |
| **Tenant organization** | Tenancy aggregate — boundary of SaaS customer data |

---

## Events

Authoritative inventory: [event-catalog.md](../reference/event-catalog.md) § Parties. All rows are **Planned** until first emit; Status must move to **Published** in the same change set as the producer (ADR-0006).

### Catalog-defined Party events

| Event `type` | Classification | Replayable | Notes |
| --- | --- | --- | --- |
| `parties.party.created` | BUSINESS | Yes | Master create |
| `parties.party.updated` | BUSINESS | Yes | Profile / field changes |
| `parties.party.activated` | BUSINESS | Yes | Lifecycle |
| `parties.party.inactivated` | BUSINESS | Yes | Lifecycle |
| `parties.party.deleted` | BUSINESS | Yes | Soft delete |
| `parties.party.merged` | BUSINESS | Conditional | Sensitive remap; dual-control ops posture for bulk replay |
| `parties.classification.granted` | BUSINESS | Yes | Customer/supplier/… grant |
| `parties.classification.revoked` | BUSINESS | Yes | Classification remove |
| `parties.channel.added` | BUSINESS | Yes | Contact method add |
| `parties.channel.removed` | BUSINESS | Yes | Contact method remove |
| `parties.relationship.created` | BUSINESS | Yes | Graph edge |
| `parties.relationship.removed` | BUSINESS | Yes | Graph edge |
| `parties.principal.linked` | **SECURITY** | Yes | Identity link — outbox-mandatory |
| `parties.principal.unlinked` | **SECURITY** | Yes | Identity unlink — outbox-mandatory |

### Ownership

* **Owner module:** Parties only.  
* **Prefix:** `parties.` — no other module may publish these types.  
* **Envelope:** ADR-0003 fields required; **`organizationId` always set** for Parties events.

### Publication rules

1. Persist party aggregate mutation and outbox append in the **same unit of work** ([ADR-0003](../adr/0003-event-contracts-and-outbox.md), [ADR-0006](../adr/0006-architecture-enforcement-and-governance.md)).  
2. **SECURITY** types (`parties.principal.linked` / `parties.principal.unlinked`) are **outbox-mandatory** — never fire-and-forget only.  
3. Material **BUSINESS** master-data types in this table are treated as **outbox-required** for Shared correctness (Orders/search/Audit consumers).  
4. Do not publish types absent from the event catalog.  
5. Breaking payload changes require catalog Versioning Rules (`.vN` or new type).  
6. Prefer Audit consumption via outbox projection; Shared **may** call Audit `record` from application layer (unlike Identity/Tenancy/RBAC packages).

### Replay expectations

| Class | Expectation |
| --- | --- |
| BUSINESS (Replayable = Yes) | Idempotent consumers on `eventId`; safe for search/cache rebuild and Audit backfill |
| `parties.party.merged` (Conditional) | Replay only with explicit ops control; consumers must not corrupt historical order party refs |
| SECURITY principal link events | Replay for Audit/auth projections only; never truncated for analytics reclaim (ADR-0004 SECURITY class) |

Parties SoR is **not** rebuilt by wiping and replaying events as if it were Reporting. Events support projections and integrations; Party tables remain the business SoR for party truth.

---

## Permissions

Authoritative keys: [permission-catalog.md](../reference/permission-catalog.md) § Parties.

| Permission key | Intent | Typical roles (catalog legend) |
| --- | --- | --- |
| `parties.party.read` | View parties | org admin, location manager, staff, auditor |
| `parties.party.manage` | Create/update/lifecycle parties | org admin, location manager, staff |
| `parties.classification.manage` | Grant/revoke classification role keys | org admin, location manager |
| `parties.principal.link` | Link/unlink Identity principal | org admin |
| `parties.relationship.manage` | Create/remove relationships | org admin, location manager, staff |
| `parties.party.merge` | Merge parties (sensitive) | org admin |

### Permission rules for S1

1. Keys must be **registered** into RBAC catalog seed / register API — ⊆ permission catalog (no invented keys).  
2. Host or application layer calls RBAC `authorize` before mutating/query use cases; Parties does not re-implement policy engines.  
3. Classification grant/revoke uses `parties.classification.manage`, not only generic manage, when those operations are distinct use cases.  
4. Principal link uses `parties.principal.link` (SECURITY-adjacent).  
5. Merge requires `parties.party.merge` (sensitive).  

Intended role bindings for `organization.administrator` / other templates are composed in RBAC seed updates — not hardcoded owner bypasses.

---

## Dependencies

### Allowed

| Dependency | Usage |
| --- | --- |
| **`@nbcp/outbox`** | Transactional publication of catalog events |
| **Identity** (facade) | Validate `principalId` on link; no credential ownership |
| **Tenancy** (facade) | Tenant `organizationId` / membership context; optional location affinity validation |
| **RBAC** (facade) | `authorize` / permission checks for Parties keys |
| **Audit** | Event consumption and/or Shared-allowed `record` calls |

Direction: **Parties → Core/Audit**; never reverse (Identity / Tenancy / RBAC packages must not import Parties).

### Forbidden

| Dependency | Reason |
| --- | --- |
| **Catalog** | Layer/order: Catalog must not be required for Party SoR; avoid Shared cycles |
| **Orders** | Orders will depend on Parties later — not the reverse |
| **Payments** | Money path must not enter Parties |
| **Ledger** | Financial SoR isolation (ADR-0005) |
| **Inventory** | Stock truth ≠ party master data |
| **Reporting** | Analytics must not become Party SoR dependency |
| **Product modules** | Shared must not depend on Product (ADR-0002 / ADR-0006) |

### Package / import governance

* Public facade only — no deep imports of Core internals.  
* Architecture enforcement must fail Parties → Catalog|Orders|Payments|Ledger|Inventory|Reporting and Shared → Product edges.  
* New `parties.*` event/permission strings require catalog updates in the same PR as first use.

---

## Acceptance Criteria

Objective signals for Parties S1 (checklist S1: *Facade + events in catalog; permissions seeded*):

| # | Criterion | Objective signal |
| --- | --- | --- |
| AC-1 | Party SoR exists for individual and organization kinds | Create + get within a tenant; kinds distinguished |
| AC-2 | Customer / supplier / employee are classifications | Grant/revoke role keys; multi-classification supported |
| AC-3 | Contact methods owned by Party | Channel/address add/remove reflected on party; events where catalogued |
| AC-4 | Lifecycle statuses enforced | Activate / inactivate / delete (and merge if in scope for S1) behave per status table; invalid transitions rejected |
| AC-5 | Tenant isolation | Queries/commands require `organizationId`; no cross-tenant read/write |
| AC-6 | Principal link optional and unique per tenant | Link validates Identity; duplicate `(tenant, principalId)` denied; `parties.principal.linked` / `unlinked` in outbox |
| AC-7 | Catalog events published | Declared `parties.*` types ⊆ event catalog; SECURITY + material BUSINESS via outbox in same UoW |
| AC-8 | Permissions seeded | All Parties permission keys registered; authorize deny-by-default without grant |
| AC-9 | Dependency DAG | Parties depends only on allow-list; architecture tests fail forbidden edges |
| AC-10 | Audit visibility | SECURITY (and material BUSINESS) actions appear in Audit via projection and/or record — producers need not break DAG |
| AC-11 | Catalog Status | Emitted Party event types marked **Published** when first shipped |
| AC-12 | No vertical leakage | No guest/patient/student-required fields on Party aggregate |

**S1 minimum vs stretch:** Merge (`parties.party.merged` / `parties.party.merge`) may be staged if explicitly deferred in the implementation PR with catalog still listing the type as Planned — prefer include for full S1 fidelity to checklist “events in catalog” producer coverage. Relationship graph is in design scope for S1 unless the PR documents a time-boxed subset with residual AC on relationships.

---

## Testing Strategy

### Domain tests

* Invariants: tenant ownership, immutable kind, status transitions, classification uniqueness rules, relationship allowlist, principal uniqueness per tenant  
* Contact method normalization / primary channel rules (per design)  
* Soft-delete / inactive blocking of **new** relationships where specified  

### Integration tests

* Create individual + organization party in an org; grant `customer` / `supplier`; query by classification  
* Lifecycle activate/inactivate/delete with outbox rows present after commit  
* Principal link/unlink against Identity facade; uniqueness conflict  
* RBAC: without `parties.party.manage`, mutations denied; with bootstrap/admin grant, allowed  
* Rollback of UoW leaves no party change and no outbox row  

### Architecture tests

* Package dependency allow-list (Outbox, Identity, Tenancy, RBAC, Audit only among modules)  
* Forbidden imports of Catalog / Orders / Payments / Ledger / Inventory / Reporting / Product  
* No deep Core internals imports  
* Declared `parties.*` event types ⊆ event catalog  
* Parties permission seeds ⊆ permission catalog  
* SECURITY principal link path asserts outbox append in same UoW  
* Identity / Tenancy / RBAC still have **zero** Parties dependency  

---

## Definition of Done — Shared Domain Milestone S1

S1 is **complete** when all of the following are true:

1. **Facade delivered** — Parties public application facade covers party create/update, classifications, contact methods (channels/addresses at minimum), lifecycle, and principal link (relationships included unless explicitly residual with tracker item).  
2. **Events live** — Catalog Party types that the facade emits are published through `@nbcp/outbox` with correct classification/ownership; Status → **Published** for those types.  
3. **Permissions seeded** — All six Parties permission keys exist in RBAC registry and are enforceable via authorize.  
4. **Acceptance criteria AC-1…AC-12** evidenced by automated tests (any deferred AC called out with residual ticket and architect approval).  
5. **Architecture / CI** — Parties package green under `pnpm enforce:architecture` and module architecture suite; no Core → Parties reverse edges.  
6. **Documentation** — `modules/parties` README + CHANGELOG; design status updated from “design only” to implemented; this package marked Implemented with package path.  
7. **Kernel gate intact** — M6 enforcement remains green; no new Active exceptions without register expiry.  

**Exit to Catalog (S2):** S1 green. Catalog may depend on Tenancy/RBAC; it must not require Parties for item SoR, but Orders (S3) will require Parties facade for commercial party references.

---

## Sequencing Reminder

```text
M6 Kernel Complete
  → S1 Parties   ← this package
  → S2 Catalog
  → S3 Orders
  → S4 Payments / S5 Ledger (ADR-0005; Payments ↛ Ledger writes)
```

Do not open Payments or Ledger from this package. Do not implement product vertical CRM as a substitute for Parties.

---

## Document control

| Version | Date | Notes |
| --- | --- | --- |
| 1.0 | 2026-07-14 | Initial Parties implementation package for Shared S1 — documentation only |
