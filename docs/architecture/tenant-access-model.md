# Tenant Access Model

**Status:** Normative  
**Remediates:** Kernel review [K-02](../reviews/kernel-review.md), [K-03](../reviews/kernel-review.md)  
**Last updated:** 2026-07-14  

This document defines how **organization membership**, **ownership**, **location**, and **RBAC** combine into a single coherent access model — without new module dependencies, without Identity depending on Tenancy/RBAC, and without Tenancy depending on RBAC.

Related: [tenancy design](../modules/tenancy/design.md), [rbac design](../modules/rbac/design.md), [tenancy-model.md](tenancy-model.md), [authz-model.md](authz-model.md).

---

## 1. Principles

1. **AuthN ≠ tenant access ≠ AuthZ** — Identity authenticates; Tenancy establishes membership; RBAC grants permissions.
2. **Deny by default** for authorization ([RBAC design](../modules/rbac/design.md)).
3. **No owner bypass** of RBAC — ownership is a Tenancy fact; administrative power requires an RBAC assignment (K-02).
4. **One authz location semantic** — only RBAC role-assignment scope governs “where” a permission applies (K-03).
5. Preserve DAG:

```text
identity ← tenancy ← (consumers)
identity ← rbac
tenancy  ← rbac
```

Tenancy must not import RBAC. Identity must not import Tenancy or RBAC.

---

## 2. Request access pipeline (normative)

For any tenant-scoped operation:

```text
1) Identity.resolveSession(token)           → principalId
2) Tenancy.resolveTenantContext(...)        → membership active in organizationId
                                              (+ location exists if locationId provided)
3) RBAC.authorize(principalId, permission,
                  organizationId, locationId?) → allow | deny
4) Proceed with use case only if allow
```

If step 2 fails → deny (not a member / bad location).  
If step 3 fails → deny (permission_denied / location_out_of_scope).  
Never skip step 3 because `ownerPrincipalId === principalId`.

---

## 3. Finding K-03 — Location semantics (resolved)

### 3.1 Decision

| Concept | Module | Meaning | Used by `authorize`? |
| --- | --- | --- | --- |
| **Assignment location** (`RoleAssignment.locationId`) | RBAC | Authorization scope: `null` = org-wide; set = that location only | **Yes — authoritative** |
| **Request location** (`locationId` on authorize / tenant context) | Call site / Tenancy validation | The location the actor is acting in | Compared to assignment scope |
| **Membership home location** (`Membership.locationId`) | Tenancy | Optional **organizational affinity** / default UI home (roster field) | **No — never used by authorize** |

**Normative rule:** RBAC evaluation **ignores** `Membership.locationId`. Products may use it for defaults (e.g. pre-select a branch in UI) only.

### 3.2 Implementation constraint on Tenancy

To reduce confusion during Phase 1 scaffolds:

- Prefer treating `Membership.locationId` as **optional and non-authoritative**.
- Do **not** document or implement “member can only act at membership location” via Tenancy.
- If a principal must be limited to a location, grant a **location-scoped role assignment** in RBAC.

### 3.3 Examples

| Setup | Authorize inventory adjust at Loc_A | Result |
| --- | --- | --- |
| Org-wide admin assignment (`locationId=null`) | Loc_A | Allow |
| Location manager assignment at Loc_A | Loc_A | Allow |
| Location manager assignment at Loc_A | Loc_B | Deny |
| Membership.home=Loc_A but only Loc_B role assignment | Loc_A | Deny |
| Membership.home=Loc_A, org-wide staff role | Loc_B | Allow (membership home irrelevant) |

---

## 4. Finding K-02 — Organization owner bootstrap (resolved)

### 4.1 Problem

Tenancy always has `ownerPrincipalId`. RBAC deny-by-default means the owner **cannot** manage the org until they receive `organization.administrator` (or equivalent). If bootstrap is skipped, teams are pressured to add an owner bypass — which is forbidden.

### 4.2 Decision — mandatory bootstrap composition

Organization creation is a **host application composition** (or worker reacting to Tenancy events from a package that **may** depend on both Tenancy and RBAC). It must not live inside Tenancy as a dependency on RBAC.

**Canonical sequence** (same logical unit of work from the API/user’s perspective):

```text
A. tenancy.createOrganization({ ownerPrincipalId, ... })
   → emits tenancy.organization.created (outbox; ADR-0003)

B. rbac.ensureSystemRoles({ organizationId })

C. rbac.assignRole({
     principalId: ownerPrincipalId,
     organizationId,
     roleKey: "organization.administrator",
     locationId: null          // org-wide
   })
   → emits rbac.role_assignment.granted (outbox)
```

**Success criteria:** After create-org completes, `rbac.authorize(owner, 'rbac.assignment.manage', org, null)` (or another admin permission) returns **allow**.

### 4.3 Where the composer may live (DAG-safe options)

| Option | Dependencies | Allowed? |
| --- | --- | --- |
| `apps/api` (or `apps/worker`) orchestrates A→B→C | App → tenancy, rbac | **Yes — preferred** |
| RBAC module handler on `tenancy.organization.created` | RBAC → Tenancy (facade/events already allowed) | **Yes** |
| Logic inside Tenancy calling RBAC | Tenancy → RBAC | **No** |
| Logic inside Identity | Identity → * | **No** |

If using the RBAC event handler option: handler must be **idempotent** (re-assign admin if missing) and driven by outbox events ([event-contracts.md](event-contracts.md)).

### 4.4 Ownership transfer

On `tenancy.organization.owner_transferred`:

1. Ensure new owner has `organization.administrator` (assign if missing).
2. Do **not** automatically revoke the previous owner’s admin role (may still be an admin) — optional policy later; default leave assignments intact unless an explicit demote use case runs.
3. Tenancy ownership and RBAC remain separate facts; both must be correct after transfer.

### 4.5 Explicit bans

| Ban | Reason |
| --- | --- |
| `if (principalId === ownerPrincipalId) allow` in any module | Bypasses RBAC; recreates K-02 failure mode |
| Shipping create-org without step B+C | Defect — treat as incomplete feature |
| Storing permission arrays on membership | Belongs in RBAC |

### 4.6 Verification (when implemented)

Automated test: create organization as principal P → assert admin assignment exists → assert `authorize` allows a designated admin permission → assert Tenancy never imports `@nbcp/rbac`.

---

## 5. System role keys (bootstrap contract)

Minimum system templates referenced by bootstrap:

| Role key | Scope of typical assignment | Purpose |
| --- | --- | --- |
| `organization.administrator` | Org-wide (`locationId=null`) | Full tenant administration |
| `location.manager` | Location-scoped | Branch operations (pack permissions) |
| `organization.staff` | Often location-scoped | Limited day-to-day permissions |

Invitation `suggestedRoleKey` (Tenancy) MUST be a known system or org role key when invitations attempt post-accept assignment — validation belongs in the **app composer** or RBAC API when assigning (not in Tenancy importing RBAC). See also [invitation-acceptance-policy.md](invitation-acceptance-policy.md).

---

## 6. Kernel dependency matrix (access-related)

| From \ To | Identity | Tenancy | RBAC | Audit |
| --- | --- | --- | --- | --- |
| Identity | — | No | No | No |
| Tenancy | Yes (facade) | — | No | No |
| RBAC | Yes | Yes | — | No |
| Audit | Yes | Yes | No* | — |
| Apps / composers | Yes | Yes | Yes | Yes |

\*Audit must not depend on RBAC for write path; read authz enforced in API host ([audit design](../modules/audit/design.md)).

---

## 7. Related documents

- [invitation-acceptance-policy.md](invitation-acceptance-policy.md)
- [event-contracts.md](event-contracts.md)
- [ADR-0003](../adr/0003-event-contracts-and-outbox.md)
- [Kernel review](../reviews/kernel-review.md)
