# Permission Catalog

**Status:** Authoritative inventory (canonical)  
**Owner registry:** RBAC module seeds + this document  
**Related:** [rbac/design.md](../modules/rbac/design.md), [tenant-access-model.md](../architecture/tenant-access-model.md), [ADR-0006](../adr/0006-architecture-enforcement-and-governance.md), [Event catalog](event-catalog.md)  
**Last updated:** 2026-07-14  

This document is the **canonical inventory** of RBAC permission keys for Core and Shared platform modules. Product packs may add product-prefixed keys; they must not redefine keys listed here.

Core Identity / Tenancy / RBAC / Audit keys listed below are **seeded** by `@nbcp/rbac` (`seedCoreCatalog`). Shared and Product keys remain **Planned** until registered at runtime.

---

## Naming Conventions

| Rule | Requirement | Example |
| --- | --- | --- |
| **Pattern** | `^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$` | `orders.order.commit` |
| **Module prefix** | First segment = owning module id | `ledger.`, `tenancy.` |
| **Resource.action** | Stable resource then verb | `stock.adjust`, `journal.reverse` |
| **Verbs** | Prefer `read`, `manage`, `create`, `cancel`, domain verbs (`commit`, `capture`, `reverse`) | — |
| **Sensitivity** | Sensitive money/security mutations get distinct keys (not folded into broad `manage` when dual-control matters) | `payments.payment.refund` |
| **No events-as-permissions** | Permission keys ≠ domain event types (events use past tense facts) | Event `orders.order.committed` ≠ permission |

**Identity note:** Most Identity APIs are principal self-service or unauthenticated (register/login/reset). Keys under Identity below are for **platform / support** administration and must not invent org-tenant ownership of global users.

---

## Intended Role Legend

| Role key | Meaning |
| --- | --- |
| `organization.administrator` | Org-wide admin (bootstrap on owner) |
| `location.manager` | Location-scoped ops lead |
| `staff` | Narrow operational worker |
| `finance.operator` | Payments/ledger day-to-day (tenant) |
| `finance.controller` | Reversals / sensitive finance |
| `auditor` | Read-only investigation |
| `platform.operator` | Cross-tenant / platform support (break-glass; not a tenant self-serve role) |
| `self` | Acting on own principal only (not an RBAC grant — documented for clarity) |

Packs may introduce additional roles that **bind** these permissions; they must not rename platform keys.

---

## Identity

| Permission key | Module owner | Description | Intended roles |
| --- | --- | --- | --- |
| `identity.user.read` | Identity | View user profile / status (support) | `platform.operator` |
| `identity.user.manage` | Identity | Activate / suspend / deactivate / unlock users (support) | `platform.operator` |
| `identity.session.revoke` | Identity | Force-revoke sessions for a principal | `platform.operator` |
| `identity.external_identity.manage` | Identity | Link/unlink external identities (support) | `platform.operator` |

Self-service register, login, password reset, and own-profile update **do not** require RBAC grants (`self` / public flows per Identity design).

---

## Tenancy

| Permission key | Module owner | Description | Intended roles |
| --- | --- | --- | --- |
| `tenancy.organization.read` | Tenancy | View organization profile | `organization.administrator`, `location.manager`, `staff`, `auditor` |
| `tenancy.organization.manage` | Tenancy | Update org settings; suspend/archive per policy | `organization.administrator` |
| `tenancy.location.read` | Tenancy | View locations | `organization.administrator`, `location.manager`, `staff` |
| `tenancy.location.manage` | Tenancy | Create/update/deactivate locations | `organization.administrator`, `location.manager` |
| `tenancy.membership.read` | Tenancy | List/view memberships | `organization.administrator`, `location.manager`, `auditor` |
| `tenancy.membership.manage` | Tenancy | Add/remove/suspend members | `organization.administrator`, `location.manager` (scoped) |
| `tenancy.invitation.manage` | Tenancy | Create/revoke invitations | `organization.administrator`, `location.manager` |
| `tenancy.organization.transfer_owner` | Tenancy | Transfer organization owner | `organization.administrator` (+ dual-control policy) |

---

## RBAC

| Permission key | Module owner | Description | Intended roles |
| --- | --- | --- | --- |
| `rbac.permission.read` | RBAC | View registered permission catalog | `organization.administrator`, `auditor` |
| `rbac.role.read` | RBAC | View roles and role permissions | `organization.administrator`, `auditor` |
| `rbac.role.manage` | RBAC | Create/update/delete org roles and permission sets | `organization.administrator` |
| `rbac.assignment.manage` | RBAC | Grant/revoke role assignments (incl. location scope) | `organization.administrator` |
| `rbac.assignment.read` | RBAC | View assignments for principals in org | `organization.administrator`, `auditor` |

Bootstrap exception: first `organization.administrator` assignment on org create may run without actor holding `rbac.assignment.manage` ([rbac/design.md](../modules/rbac/design.md)).

---

## Audit

| Permission key | Module owner | Description | Intended roles |
| --- | --- | --- | --- |
| `audit.read` | Audit | Query audit records for the organization | `organization.administrator`, `auditor`, `finance.controller` |
| `audit.retention.manage` | Audit | Trigger archive/purge workflows (ops) | `platform.operator` (+ dual-control on purge) |

Appends are produced by system handlers/APIs — not a tenant “write audit” permission.

---

## Parties

| Permission key | Module owner | Description | Intended roles |
| --- | --- | --- | --- |
| `parties.party.read` | Parties | View parties | `organization.administrator`, `location.manager`, `staff`, `auditor` |
| `parties.party.manage` | Parties | Create/update/lifecycle parties | `organization.administrator`, `location.manager`, `staff` |
| `parties.classification.manage` | Parties | Grant/revoke classification role keys | `organization.administrator`, `location.manager` |
| `parties.principal.link` | Parties | Link/unlink Identity principal | `organization.administrator` |
| `parties.relationship.manage` | Parties | Create/remove relationships | `organization.administrator`, `location.manager`, `staff` |
| `parties.party.merge` | Parties | Merge parties (sensitive) | `organization.administrator` |

---

## Catalog

| Permission key | Module owner | Description | Intended roles |
| --- | --- | --- | --- |
| `catalog.item.read` | Catalog | View catalog items/variants/prices | `organization.administrator`, `location.manager`, `staff` |
| `catalog.item.manage` | Catalog | Create/update/lifecycle items, variants, prices | `organization.administrator`, `location.manager` |
| `catalog.tax.manage` | Catalog | Manage tax categories | `organization.administrator`, `finance.operator` |

---

## Orders

| Permission key | Module owner | Description | Intended roles |
| --- | --- | --- | --- |
| `orders.order.read` | Orders | View orders | `organization.administrator`, `location.manager`, `staff`, `auditor`, `finance.operator` |
| `orders.order.manage` | Orders | Create/edit draft orders | `organization.administrator`, `location.manager`, `staff` |
| `orders.order.commit` | Orders | Commit drafts (commercial commitment) | `organization.administrator`, `location.manager`, `staff` |
| `orders.order.fulfill` | Orders | Mark fulfill / partial fulfill | `organization.administrator`, `location.manager`, `staff` |
| `orders.order.cancel` | Orders | Cancel orders | `organization.administrator`, `location.manager` |

---

## Payments

| Permission key | Module owner | Description | Intended roles |
| --- | --- | --- | --- |
| `payments.payment.read` | Payments | View payment intents and outcomes | `organization.administrator`, `finance.operator`, `finance.controller`, `auditor` |
| `payments.payment.create` | Payments | Create payment intents | `organization.administrator`, `finance.operator`, `staff` |
| `payments.payment.capture` | Payments | Capture authorized payments | `organization.administrator`, `finance.operator` |
| `payments.payment.refund` | Payments | Refund (sensitive) | `finance.controller`, `organization.administrator` |
| `payments.payment.cancel` | Payments | Cancel payment intents | `organization.administrator`, `finance.operator` |

---

## Ledger

| Permission key | Module owner | Description | Intended roles |
| --- | --- | --- | --- |
| `ledger.account.read` | Ledger | View chart of accounts | `organization.administrator`, `finance.operator`, `finance.controller`, `auditor` |
| `ledger.account.manage` | Ledger | Create/update accounts | `finance.controller`, `organization.administrator` |
| `ledger.journal.read` | Ledger | View journal entries / postings | `organization.administrator`, `finance.operator`, `finance.controller`, `auditor` |
| `ledger.journal.post` | Ledger | Post balanced journals (manual / projector APIs) | `finance.operator`, `finance.controller` |
| `ledger.journal.reverse` | Ledger | Reverse posted journals (sensitive) | `finance.controller` |

Balances are derived; no separate “balance.manage” permission.

---

## Inventory

| Permission key | Module owner | Description | Intended roles |
| --- | --- | --- | --- |
| `inventory.stock.read` | Inventory | View stock balances / movements | `organization.administrator`, `location.manager`, `staff`, `auditor` |
| `inventory.stock.receive` | Inventory | Post receipts | `organization.administrator`, `location.manager`, `staff` |
| `inventory.stock.issue` | Inventory | Post issues | `organization.administrator`, `location.manager`, `staff` |
| `inventory.stock.transfer` | Inventory | Post transfers | `organization.administrator`, `location.manager` |
| `inventory.stock.adjust` | Inventory | Adjustments (sensitive) | `organization.administrator`, `location.manager` |
| `inventory.stock.reserve` | Inventory | Soft-reserve stock | `organization.administrator`, `location.manager`, `staff` |

---

## Reporting

| Permission key | Module owner | Description | Intended roles |
| --- | --- | --- | --- |
| `reporting.sales.read` | Reporting | Run operational sales reports (non-book) | `organization.administrator`, `location.manager`, `staff`, `finance.operator` |
| `reporting.read` | Reporting | View reporting projections and reports (S7) | `organization.administrator`, `finance.operator`, `auditor` |
| `reporting.kpi.read` | Reporting | View KPI dashboards (S7) | `organization.administrator`, `finance.operator`, `auditor` |
| `reporting.export` | Reporting | Export reporting datasets (S7) | `organization.administrator`, `finance.operator`, `auditor` |
| `reporting.inventory.read` | Reporting | Stock analytics | `organization.administrator`, `location.manager` |
| `reporting.finance.read` | Reporting | Payment/ledger **dashboards** (non-authoritative books) | `organization.administrator`, `finance.operator`, `finance.controller`, `auditor` |
| `reporting.export.request` | Reporting | Request exports | `organization.administrator`, `finance.operator`, `auditor` |
| `reporting.definition.manage` | Reporting | Manage report definitions | `organization.administrator` |

Reporting never grants authority to mutate Orders/Payments/Ledger/Inventory SoR ([ADR-0005](../adr/0005-financial-truth-and-projection-ownership.md)).

---

## Governance

### Who may add permissions

* **Owning module** maintainers propose keys in design + this catalog.  
* RBAC registers keys into `rbac_permissions` (pack or platform seed).  
* Cross-cutting disputes → platform architecture.

### Same-PR rule

Adding an authorize check for a new key without a catalog row is a **defect** ([ADR-0006](../adr/0006-architecture-enforcement-and-governance.md)). Catalog-first or same-PR required.

### Deprecation

1. Mark deprecated in catalog + `rbac_permissions.deprecated_at`.  
2. Stop granting on new roles; migrate existing roles.  
3. Remove from evaluation allow-list after grace period.

### Alignment with events

Sensitive actions that emit SECURITY/FINANCIAL events should map 1:1 to distinct permissions where dual-control is expected (e.g. refund, reverse, membership remove).

---

## Future Work

* Machine-readable export (YAML/JSON) for RBAC seed generation.  
* CI: fail unknown permission string literals vs this catalog.  
* Product annex catalogs for vertical keys.  
* Pack → default role binding matrices.

---

## Document control

| Version | Date | Notes |
| --- | --- | --- |
| 1.0 | 2026-07-14 | Initial catalog from module designs; remediates readiness R-04 |
| 1.1 | 2026-07-14 | Core Identity/Tenancy/RBAC/Audit keys seeded by WP-04 `@nbcp/rbac` |
