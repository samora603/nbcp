# RBAC Module — Design

| Field | Value |
| --- | --- |
| **Module** | `rbac` (`modules/rbac` — future implementation) |
| **Layer** | Core Platform ([ADR-0002](../../adr/0002-domain-map.md)) |
| **Stack** | NestJS + Prisma ([ADR-0001](../../adr/0001-platform-technology-foundation.md)) |
| **Structure** | [Module standard](../../architecture/module-standard.md) |
| **Status** | Design only — no implementation in this document |
| **Last updated** | 2026-07-14 |

**Normative companions:** [Tenant access model](../../architecture/tenant-access-model.md) (deny-by-default pipeline, location scope, org admin bootstrap) · [Permission catalog](../../reference/permission-catalog.md)

---

## 1. Purpose

The **RBAC** module owns **authorization** inside a tenant context: permission definitions, role definitions, role assignments, and deny-by-default policy evaluation.

It answers: *May this principal perform this action on this resource within this organization (and optional location)?*

It does **not** answer: *Who is authenticated?* (`identity`) or *Are they a member of this org?* (`tenancy`). Those prerequisites are asserted via facades before or during authorization.

### In scope

- Permission catalog (`resource.action` strings)
- Role definitions (named permission sets)
- Role assignments to principals within an organization (optional location scope)
- Organization-scoped access evaluation
- Location-scoped access evaluation
- Deny-by-default `authorize(...)` API
- System / seed roles (e.g. organization administrator) and product-pack permission registration hooks

### Explicit non-goals

- Authentication, credentials, sessions (→ [`identity`](../identity/design.md))
- Organizations, memberships, invitations (→ [`tenancy`](../tenancy/design.md))
- Attribute-based rules beyond role + org/location scope (future extension ADR)
- Embedding permission checks only in UI
- Industry-specific permission names that encode restaurant/hotel concepts into Core without product packs

### Dependency rules (hard)

```text
identity  ←── (PrincipalId only; no rbac imports)
tenancy   ←── (OrganizationId, LocationId, Membership; no rbac imports)
   ▲                ▲
   │ facade         │ facade
   └────── rbac ────┘
```

| Module | May depend on RBAC? |
| --- | --- |
| Identity | **No** |
| Tenancy | **No** |
| RBAC | **Yes** → Identity facade + Tenancy facade |
| Shared business / products / apps | **Yes** → RBAC `authorize` |

Tenancy may pass opaque `suggestedRoleKey` on invitations ([tenancy design](../tenancy/design.md)); RBAC interprets keys when assigning roles — Tenancy never imports RBAC.

---

## 2. Ubiquitous language

| Term | Meaning in RBAC |
| --- | --- |
| **Permission** | Stable string `resource.action` (e.g. `inventory.stock.adjust`) |
| **Permission catalog** | Registry of allowlisted permissions (platform + product packs) |
| **Role** | Named set of permissions, defined in an organization (or as a system template) |
| **Role assignment** | Binding of a role to a `PrincipalId` within an `OrganizationId`, optionally limited to a `LocationId` |
| **Scope** | Evaluation context: organization always; location when the assignment or request requires it |
| **Authorize** | Deny-by-default decision: allow only if membership is valid **and** a matching assignment grants the permission at sufficient scope |
| **System role template** | Built-in role definition seeded for every org (or assignable by key) — e.g. `organization.administrator` |

---

## 3. Bounded context & aggregates

| Aggregate | Responsibility |
| --- | --- |
| **PermissionCatalog** (or catalog as config + entities) | Register/list permissions; enforce naming; product-pack registration |
| **Role** | Role definition within an org (or system template id) and its permission set |
| **RoleAssignment** | Principal ↔ Role within org (+ optional location) |

```text
Permission (entity in catalog)
Role (AR)
└── RolePermission[] (entities) — permissions included in the role

RoleAssignment (AR)
└── principalId + organizationId + roleId + locationId?
```

**Catalog modeling:** Platform permissions may be code-seeded (migration/seed) rather than a mutable runtime aggregate in early phases. Product packs **register** additional permissions through a controlled API. Treat catalog mutations as admin/platform use cases with audit.

---

## 4. Aggregates (detail)

### 4.1 Permission (catalog entry)

**Invariants:**

1. Permission id/key matches `^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$` (resource.action; multi-segment resource allowed, e.g. `tenancy.membership.remove`).
2. Keys are globally unique in the catalog.
3. Permissions are never deleted if referenced by roles — deprecate instead (`deprecatedAt`).
4. Product-pack permissions carry `packId` / source metadata.

### 4.2 Role

**Invariants:**

1. Role belongs to exactly one `organizationId` **or** is a system template (`isSystemTemplate = true`, `organizationId` null) cloned/assigned by key.
2. Role name unique within an organization (among non-deleted).
3. Role may only include permissions present in the catalog.
4. System templates are immutable to tenant admins (clone-on-customize pattern optional).

**Role kinds:**

| Kind | Description |
| --- | --- |
| `system_template` | Seeded definitions (`organization.administrator`, …) |
| `organization` | Custom or cloned roles owned by an org |

### 4.3 RoleAssignment

**Invariants:**

1. Assignment always includes `principalId`, `organizationId`, `roleId`.
2. Optional `locationId` must belong to that organization (validated via Tenancy facade).
3. Principal must have **active** Tenancy membership in that organization before assignment (deny otherwise).
4. At most one assignment per `(principalId, organizationId, roleId, locationId)` including null-location as a distinct scope.
5. Org-wide assignment (`locationId = null`) grants the role at **all locations** within the org for permissions that are location-sensitive (see §8 evaluation rules).
6. Location-scoped assignment grants only when request location matches (or is a child of that location if hierarchy is added later — v1: exact match).

---

## 5. Entities

| Entity | Parent | Role |
| --- | --- | --- |
| **Permission** | Catalog | key, description, pack/source, deprecatedAt? |
| **RolePermission** | Role | permissionKey |
| **RoleAssignment** | (AR) | binding fields + `assignedAt`, `assignedByPrincipalId?` |

---

## 6. Value objects

| Value object | Description |
| --- | --- |
| **PermissionKey** | Validated `resource.action` string |
| **RoleId** | Opaque id |
| **RoleKey** | Stable key for system templates (e.g. `organization.administrator`) |
| **PrincipalId** | From Identity — opaque reference only |
| **OrganizationId** | From Tenancy |
| **LocationId** | From Tenancy — optional on assignment and on authorize context |
| **AssignmentScope** | `{ organizationId, locationId? }` |
| **AuthzDecision** | `{ allowed: boolean, reason: AuthzDenialReason? }` |
| **AuthzDenialReason** | `unauthenticated` \| `not_a_member` \| `membership_inactive` \| `permission_denied` \| `location_out_of_scope` \| `permission_unknown` \| … |
| **ResourceAction** | Alias of PermissionKey at call sites |

---

## 7. Domain events

| Event | When | Typical consumers |
| --- | --- | --- |
| `rbac.permission.registered` | Permission added to catalog | audit, docs generators |
| `rbac.permission.deprecated` | Permission deprecated | audit |
| `rbac.role.created` | Role created | audit |
| `rbac.role.updated` | Permissions on role changed | audit; cache invalidation |
| `rbac.role.deleted` | Role soft-deleted | revoke assignments worker |
| `rbac.role_assignment.granted` | Assignment created | audit, notifications |
| `rbac.role_assignment.revoked` | Assignment removed | audit |
| `rbac.role_assignment.scope_changed` | Location scope changed | audit |

Authorization **decisions** are high-volume — do not emit an event per `authorize` call by default; rely on audit for sensitive *mutations* and optional sampled decision logs via telemetry.

---

## 8. Deny-by-default authorization

### 8.1 Evaluation algorithm (`authorize`)

Input:

```text
principalId
permissionKey
organizationId
locationId?          // required if permission is location-scoped in practice
```

Steps (all must pass):

1. **Permission exists** and is not deprecated for grants (deprecated permissions deny new grants; evaluate existing with policy — default: still honor until removed from roles).
2. **Tenancy:** `getMembership(organizationId, principalId)` → must be `active`. If missing/inactive → **deny** (`not_a_member` / `membership_inactive`).
3. If `locationId` provided → Tenancy confirms location belongs to organization; else **deny**.
4. Load assignments for `(principalId, organizationId)`.
5. **Allow** only if there exists an assignment whose role includes `permissionKey` AND scope matches:
   - Assignment `locationId == null` → org-wide → allow for any location in that org (for this permission).
   - Assignment `locationId == L` → allow only when request `locationId == L`.
   - Request without `locationId` → only org-wide assignments apply; location-scoped assignments do **not** grant org-wide actions.
6. Otherwise → **deny** (`permission_denied`).

**Default is deny.** No implicit “owner can do everything” inside RBAC without an assignment — the application/bootstrap grants `organization.administrator` (or equivalent) to the owner on org creation via orchestration (Tenancy event handler living in **RBAC or app**, not inside Tenancy module code importing RBAC circularly — prefer **app composer** or RBAC handler on `tenancy.organization.created` / `tenancy.membership.activated`).

### 8.2 Where to call

- Application use cases in every module (mandatory for mutations).
- HTTP guards may pre-check; **not sufficient alone**.
- UI may hide controls; **never the only control**.

### 8.3 Caching

Permission sets per principal/org may be cached with invalidation on `role_assignment.*` and `role.updated` events. Cache miss must fail closed if Tenancy/RBAC stores are unreachable (policy: deny).

---

## 9. Public APIs (module facade)

### 9.1 Catalog & roles

| API | Behavior |
| --- | --- |
| `registerPermission({ key, description, packId? })` | Platform/pack registration |
| `deprecatePermission({ key })` | Soft-deprecate |
| `listPermissions(filter?)` | Catalog query |
| `createRole({ organizationId, name, permissionKeys, key? })` | Org role |
| `updateRolePermissions({ roleId, permissionKeys })` | Replace/set permissions |
| `deleteRole({ roleId })` | Soft-delete; revoke assignments |
| `getRole({ roleId })` | Read |
| `listRoles({ organizationId })` | Includes visible system templates / clones |
| `ensureSystemRoles({ organizationId })` | Seed/bind system templates for an org |

### 9.2 Assignments

| API | Behavior |
| --- | --- |
| `assignRole({ principalId, organizationId, roleId, locationId?, assignedBy })` | Validates membership + location via Tenancy; principal via Identity |
| `revokeRole({ principalId, organizationId, roleId, locationId? })` | Remove assignment |
| `listAssignmentsForPrincipal({ principalId, organizationId })` | List |
| `listAssignmentsForRole({ roleId })` | List |

### 9.3 Authorize & introspection

| API | Behavior |
| --- | --- |
| `authorize({ principalId, permissionKey, organizationId, locationId? })` | Returns `AuthzDecision` — **deny by default** |
| `requireAuthorized(...)` | Same; throws domain/app error on deny |
| `listEffectivePermissions({ principalId, organizationId, locationId? })` | Union of granted permissions at scope (for UI) |

### 9.4 HTTP surface (illustrative)

- `GET /v1/organizations/:organizationId/roles`
- `POST /v1/organizations/:organizationId/roles`
- `POST /v1/organizations/:organizationId/role-assignments`
- `DELETE /v1/organizations/:organizationId/role-assignments/:id`
- `GET /v1/organizations/:organizationId/effective-permissions` (me)

Admin routes themselves guarded by permissions such as `rbac.role.manage`, `rbac.assignment.manage`.

---

## 10. Dependencies

### 10.1 Module dependencies

| Depends on | Usage |
| --- | --- |
| **Identity** (facade) | `assertPrincipalExists` / `getUserById` on assign |
| **Tenancy** (facade) | `getMembership`, `resolveTenantContext` / location ownership checks |

| Must not depend on | Reason |
| --- | --- |
| Products / shared domains | Keep Core stable; packs register permissions upward |
| Identity/Tenancy depending on RBAC | Forbidden — breaks kernel layering |

### 10.2 Ports

| Port | Purpose |
| --- | --- |
| `IdentityDirectory` | Principal existence |
| `TenancyDirectory` | Membership + location validation |
| `EventPublisher` | Domain events |
| `Clock` / `IdGenerator` | Standard |

### 10.3 Integration diagram

```text
┌──────────────┐   PrincipalId    ┌──────────────┐
│   identity   │◄─────────────────┤     rbac     │
└──────────────┘                  │  authorize() │
                                  └──────┬───────┘
┌──────────────┐  Org/Location/   │
│   tenancy    │◄─────────────────┘
└──────────────┘   Membership
        △
        │ no import of rbac
        │
   (events: organization.created → app/rbac handler assigns admin role)
```

---

## 11. Database ownership

RBAC owns all `rbac_*` tables. No other module may write them. Identity and Tenancy never read RBAC tables for their own invariants.

| Table | Contents |
| --- | --- |
| `rbac_permissions` | key (PK), description, pack_id, deprecated_at, created_at |
| `rbac_roles` | id, organization_id nullable, key nullable, name, kind, created_at, deleted_at |
| `rbac_role_permissions` | role_id, permission_key; PK (role_id, permission_key) |
| `rbac_role_assignments` | id, principal_id, organization_id, role_id, location_id nullable, assigned_at, assigned_by_principal_id; UNIQUE(principal_id, organization_id, role_id, location_id) |

**Indexes:** `(principal_id, organization_id)` on assignments; `(organization_id)` on roles; permission_key lookups.

Store opaque ids only — no FK requirement into `identity_*` / `tenancy_*` without ADR; validate through facades at write time.

---

## 12. Seed permissions (illustrative Core set)

Platform seed (non-exhaustive):

| Permission | Intent |
| --- | --- |
| `tenancy.organization.read` | View org profile |
| `tenancy.organization.manage` | Rename/suspend policies as allowed |
| `tenancy.location.manage` | Create/update locations |
| `tenancy.membership.manage` | Add/remove/suspend members |
| `tenancy.invitation.manage` | Create/revoke invitations |
| `rbac.role.manage` | Create/update org roles |
| `rbac.assignment.manage` | Assign/revoke roles |
| `audit.read` | Read audit for org (when audit exists) |

Product packs register additional keys (e.g. `orders.create`, `inventory.stock.adjust`) without modifying Identity/Tenancy.

---

## 13. Role examples

### 13.1 Organization administrator

| Field | Value |
| --- | --- |
| **Role key** | `organization.administrator` |
| **Scope** | Organization-wide (`locationId = null` on assignment) |
| **Who** | Typically the Tenancy **owner** at org creation; additional admins as needed |
| **Permissions (example)** | All Core management permissions: `tenancy.*` manage/read as appropriate, `rbac.role.manage`, `rbac.assignment.manage`, `audit.read`, plus pack-level admin grants if configured |
| **Assignment example** | `{ principalId: P_owner, organizationId: Org_1, roleId: Role_Admin, locationId: null }` |

**Behavior:** `authorize(P_owner, 'tenancy.membership.manage', Org_1, loc_A)` → **allow** (org-wide). Same for `loc_B`.

Bootstrap (app or RBAC event handler):

1. `tenancy.organization.created` with `ownerPrincipalId`
2. `rbac.ensureSystemRoles(Org_1)`
3. `rbac.assignRole({ principalId: owner, organizationId: Org_1, roleKey: 'organization.administrator' })`

### 13.2 Location manager

| Field | Value |
| --- | --- |
| **Role key** | `location.manager` (system template or org-custom) |
| **Scope** | **Location-scoped** assignment |
| **Permissions (example)** | `tenancy.location.read` (or limited), `tenancy.membership.manage` limited by evaluation at that location if encoded, `orders.create`, `inventory.stock.adjust`, `scheduling.entry.manage` — exact set by product pack; **not** `rbac.assignment.manage` org-wide, **not** `tenancy.organization.manage` |
| **Assignment example** | `{ principalId: P_mgr, organizationId: Org_1, roleId: Role_LocMgr, locationId: Loc_Downtown }` |

**Behavior:**

- `authorize(P_mgr, 'inventory.stock.adjust', Org_1, Loc_Downtown)` → **allow**
- `authorize(P_mgr, 'inventory.stock.adjust', Org_1, Loc_Airport)` → **deny** (`location_out_of_scope` / `permission_denied`)
- `authorize(P_mgr, 'tenancy.organization.manage', Org_1, null)` → **deny**

### 13.3 Staff member

| Field | Value |
| --- | --- |
| **Role key** | `organization.staff` (or job-specific: `retail.cashier`, still registered as permission sets — job names can stay product-pack roles) |
| **Scope** | Often location-scoped for stores; org-wide for small orgs |
| **Permissions (example)** | Narrow: `orders.create`, `orders.read`, `catalog.item.read`, `parties.read` — **no** membership manage, **no** role manage, **no** stock adjust unless granted |
| **Assignment example** | `{ principalId: P_staff, organizationId: Org_1, roleId: Role_Staff, locationId: Loc_Downtown }` |

**Behavior:**

- `authorize(P_staff, 'orders.create', Org_1, Loc_Downtown)` → **allow**
- `authorize(P_staff, 'rbac.assignment.manage', Org_1, Loc_Downtown)` → **deny**
- `authorize(P_staff, 'orders.create', Org_1, Loc_Airport)` → **deny** if only Downtown-scoped

### 13.4 Comparison

| Capability | Org admin | Location manager | Staff |
| --- | --- | --- | --- |
| Manage org settings | Yes | No | No |
| Manage roles / assignments | Yes | No (or limited local — default No) | No |
| Manage members | Yes | Optional limited | No |
| Operate at all locations | Yes | No — assigned location(s) only | Assigned location only |
| Day-to-day commercial actions | Configurable | Yes (pack-defined) | Limited pack-defined |

---

## 14. Collaboration with Identity & Tenancy

### 14.1 Request path

1. Identity `resolveSession` → `principalId`
2. Tenancy `resolveTenantContext({ principalId, organizationId, locationId? })` → membership active
3. RBAC `authorize({ principalId, permissionKey, organizationId, locationId? })`
4. Use case proceeds only if allowed

### 14.2 What each module stores

| Concern | Module |
| --- | --- |
| Password / session | Identity |
| Org membership | Tenancy |
| Role & permissions | RBAC |

### 14.3 Banned patterns

| Banned | Why |
| --- | --- |
| Identity calls `rbac.authorize` during login | Wrong layer; login ≠ tenant authorization |
| Tenancy imports RBAC to “attach roles” inside membership aggregate | Circular policy; use events/app orchestration |
| Storing permission arrays on `tenancy_memberships` | Duplicates RBAC; drifts |
| Allow if `tenancy.ownerPrincipalId === principalId` inside every module | Bypass RBAC; owner must receive admin **assignment** |
| Soft UI-only checks | Not security |

---

## 15. Security controls

1. Deny by default on authorize and on empty/failed dependency calls.
2. Assignment writes require `rbac.assignment.manage` (bootstrap exception documented).
3. Audit all grant/revoke/role-permission changes.
4. Break-glass platform operators use a separate, audited path (future ADR) — not silent bypass.
5. Effective-permission APIs still require the caller to be the principal or an admin.

---

## 16. Testing requirements (when implemented)

| Layer | Focus |
| --- | --- |
| Unit | Evaluation matrix: org-wide vs location; missing membership; unknown permission |
| Integration | Assign fails without active membership; location mismatch deny |
| Examples | Seed admin / location manager / staff fixtures matching §13 |
| Negatives | Identity/Tenancy packages must not import `@nbcp/rbac` (boundary lint) |

---

## 17. Implementation roadmap (non-binding)

1. Permission seed + Role + RoleAssignment + `authorize`
2. System templates + org bootstrap on `organization.created`
3. Effective permissions API + caching
4. Product-pack registration API
5. Optional ABAC extensions ADR

---

## 18. Related documents

- [Identity design](../identity/design.md)
- [Tenancy design](../tenancy/design.md)
- [Authz model](../../architecture/authz-model.md)
- [Domain map](../../architecture/domain-map.md)
- [ADR-0001](../../adr/0001-platform-technology-foundation.md) / [ADR-0002](../../adr/0002-domain-map.md)
- [Module standard](../../architecture/module-standard.md)
- [Security standards](../../standards/security.md)
