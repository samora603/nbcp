# Tenancy Module — Design

| Field | Value |
| --- | --- |
| **Module** | `tenancy` (`modules/tenancy` — future implementation) |
| **Layer** | Core Platform ([ADR-0002](../../adr/0002-domain-map.md)) |
| **Stack** | NestJS + Prisma ([ADR-0001](../../adr/0001-platform-technology-foundation.md)) |
| **Structure** | [Module standard](../../architecture/module-standard.md) |
| **Status** | Design only — no implementation in this document |
| **Last updated** | 2026-07-14 |

**Normative companion:** [Tenant access model](../../architecture/tenant-access-model.md) (bootstrap, location scope) · [Invitation acceptance policy](../../architecture/invitation-acceptance-policy.md)

---

## 1. Purpose

The **Tenancy** module owns the multi-tenant boundary for NBCP: **organizations**, their **lifecycle**, **ownership**, **memberships**, **locations/branches**, and **invitations**.

It answers: *Which organization (and optional location) is this principal acting within?*

It does **not** answer: *Who is the principal and how did they authenticate?* (`identity`) or *What permissions do they have inside the org?* (`rbac`).

### In scope

- Organizations (create, update profile/metadata limits, lifecycle)
- Organization ownership (primary owner principal + ownership transfer)
- Organization membership (principal ↔ org; optional location scope)
- Membership states and transitions
- Locations / branches under an organization
- Invitations (invite-by-email → accept/decline/revoke/expire)
- Queries for “orgs for principal” and “membership resolution”

### Explicit non-goals

- Authentication, passwords, sessions (→ [`identity`](../identity/design.md))
- Roles / permission evaluation (→ `rbac`; tenancy may store *membership*, not permission sets)
- Party / CRM customer records (→ `parties`)
- Platform SaaS plan entitlements (→ `billing`) — tenancy may later *check* entitlements via billing facade, not own plans
- Industry fields as first-class columns (cuisine type, star rating) — use controlled metadata / product extensions with ADR ([domain map](../../architecture/domain-map.md))

### Identity independence (hard rule)

- **Identity never depends on Tenancy** (Identity remains a kernel with no module dependencies).
- **Tenancy depends on Identity only by reference**: store and pass **`PrincipalId`**; call Identity’s **public facade** when a principal must be validated or resolved.
- Users are **never** duplicated in tenancy tables (no email-as-FK to identity internals; no copy of password/session state).
- Tenancy **must not** deep-import Identity infrastructure or write `identity_*` tables.

---

## 2. Ubiquitous language

| Term | Meaning in Tenancy |
| --- | --- |
| **Organization (Org / Tenant)** | Primary multi-tenant boundary; customer company using NBCP-powered software |
| **OrganizationId** | Opaque id referenced by all tenant-owned business rows in higher modules |
| **Location / Branch** | Optional site under an organization (store, property, campus, clinic site) |
| **PrincipalId** | Opaque id of an Identity principal — the only legal user reference |
| **Owner** | Principal with ownership rights over the organization (transferable) |
| **Membership** | Relationship binding a principal to an organization (and optionally a location) |
| **Membership state** | Lifecycle of that relationship (`invited`, `active`, `suspended`, `left`, `removed`, …) |
| **Invitation** | Offer for a person (email) to join an organization as a member |
| **Tenant context** | Resolved `{ organizationId, locationId?, principalId }` for a request |

Higher modules scope data with `organization_id` (+ optional `location_id`) and must not invent alternate tenant keys ([tenancy model](../../architecture/tenancy-model.md)).

---

## 3. Bounded context & aggregates

| Aggregate | Responsibility |
| --- | --- |
| **Organization** | Org profile, status/lifecycle, ownership, child locations collection (or locations as separate ARs — see below) |
| **Membership** | Principal↔org relationship and membership state |
| **Invitation** | Invite token lifecycle independent of membership until acceptance |

**Location modeling choice (normative for design):**

- Prefer **Location as an entity inside Organization** when locations are always loaded/changed with org admin flows and remain modest in count.
- Prefer **Location as its own aggregate** if locations have independent heavy workflows (housekeeping-scale, etc.).  

**This design treats Location as an entity owned by Organization** for stronger transactional consistency on create/archive-with-org. Implementation may split via ADR if scale requires it.

```text
Organization (AR)
├── Ownership (ownerPrincipalId + ownedSince)
├── Location[] (entities)
└── status / profile fields

Membership (AR)
└── principalId + organizationId (+ optional locationId) + state

Invitation (AR)
└── organizationId + email + token + state → becomes Membership on accept
```

---

## 4. Aggregates (detail)

### 4.1 Organization

**Invariants:**

1. Every organization has exactly one **owner** `PrincipalId` at all times (owner may transfer, never clear).
2. `slug` (if used) is unique among non-deleted orgs; `name` is required.
3. Locations belong to exactly one organization; location codes unique **within** an org.
4. Archived/deleted organizations cannot accept new memberships or invitations.
5. Soft-delete retains `OrganizationId` for referential audit; business modules must reject writes against non-active orgs.

**Organization statuses:**

| Status | Meaning |
| --- | --- |
| `pending` | Created but not yet activated (e.g. awaiting owner verification or billing) |
| `active` | Normal operations |
| `suspended` | Platform or admin freeze — read policies TBD; writes denied |
| `archived` | Closed for operations; memberships frozen |
| `deleted` | Soft-deleted |

### 4.2 Membership

**Invariants:**

1. Unique active membership per `(organizationId, principalId)` (see state rules — at most one non-terminal membership).
2. `principalId` is opaque; tenancy does not validate password — it may call `identity.getUserById` / `isAuthenticationAllowed` on accept paths.
3. Optional `locationId` must reference a location of the **same** organization.
4. Owner must always retain an `active` membership (enforced on remove/leave/transfer).
5. State transitions follow the membership lifecycle (§10).

### 4.3 Invitation

**Invariants:**

1. Token stored as **hash** only; clear token shown once at creation.
2. Invitation targets an organization + email (+ optional intended location / role hint for rbac later).
3. Single successful accept; revoke/expire prevent further accept.
4. Accept creates/activates **Membership** for `PrincipalId` (principal must already exist in Identity, or app flow registers in Identity first — see §12).
5. Unknown/abuse: rate-limit at API; do not create Identity users from Tenancy silently without an explicit orchestration use case in the app layer.

---

## 5. Entities

| Entity | Parent | Role |
| --- | --- | --- |
| **OrganizationOwnership** | Organization | `ownerPrincipalId`, `ownedSince`, optional previous owners history via events only (or separate table if required) |
| **Location** | Organization | `locationId`, `name`, `code`, `status` (`active`/`inactive`), address fields (minimal), `timezone?` |
| **Membership** | (AR) | Relationship record — see aggregate |
| **Invitation** | (AR) | Invite record — see aggregate |

Role **hints** on invitation (`suggestedRoleKey`) are opaque strings for `rbac` to interpret later — Tenancy does **not** enforce RBAC.

---

## 6. Value objects

| Value object | Description |
| --- | --- |
| **OrganizationId** | Opaque branded id |
| **LocationId** | Opaque branded id |
| **PrincipalId** | Opaque id — same brand semantics as Identity (`PrincipalId` / `UserId`) |
| **OrganizationName** | Non-empty display name |
| **OrganizationSlug** | URL-safe unique slug (optional but recommended) |
| **OrganizationStatus** | `pending` \| `active` \| `suspended` \| `archived` \| `deleted` |
| **LocationCode** | Short code unique within org |
| **LocationStatus** | `active` \| `inactive` |
| **MembershipState** | See §10 |
| **InvitationState** | `pending` \| `accepted` │ `declined` \| `revoked` \| `expired` |
| **InvitationToken** | Transient clear token at issue; hash at rest |
| **EmailAddress** | Invite target; normalized — not a FK into Identity |
| **TenantContext** | `{ organizationId, locationId?, principalId }` resolved context VO for apps |

---

## 7. Domain events

| Event | When | Typical consumers |
| --- | --- | --- |
| `tenancy.organization.created` | Org created | billing entitlements stub, audit, analytics |
| `tenancy.organization.activated` | Status → active | audit |
| `tenancy.organization.suspended` | Suspended | higher modules deny-write policies, audit |
| `tenancy.organization.archived` | Archived | audit |
| `tenancy.organization.deleted` | Soft-deleted | cascade policy handlers (careful), audit |
| `tenancy.organization.owner_transferred` | Owner changed | audit, rbac (ensure owner role), notifications |
| `tenancy.location.created` | Location added | audit |
| `tenancy.location.updated` | Location changed | audit |
| `tenancy.location.deactivated` | Location inactive | scheduling/inventory policies later |
| `tenancy.membership.created` | Membership record created | rbac default role assignment, audit |
| `tenancy.membership.activated` | State → active | audit, notifications |
| `tenancy.membership.suspended` | State → suspended | rbac session context invalidation hooks |
| `tenancy.membership.removed` | Removed by admin | rbac revoke org roles, audit |
| `tenancy.membership.left` | Member left voluntarily | rbac revoke, audit |
| `tenancy.invitation.created` | Invite issued | email via notifications port, audit |
| `tenancy.invitation.accepted` | Accepted | membership activated, audit |
| `tenancy.invitation.declined` | Declined | audit |
| `tenancy.invitation.revoked` | Revoked by admin | audit |
| `tenancy.invitation.expired` | Expired (worker) | audit |

Payloads include `organizationId`, `principalId` when known, and invitation ids. Prefer ids over PII; email on invitation events is sensitive.

---

## 8. Public APIs (module facade)

Peers and hosts use this facade only — no deep imports.

### 8.1 Organization commands

| API | Behavior |
| --- | --- |
| `createOrganization({ name, slug?, ownerPrincipalId, … })` | Create org + owner membership `active`; emit `organization.created` |
| `activateOrganization({ organizationId })` | `pending` → `active` |
| `suspendOrganization({ organizationId, reason })` | Suspend |
| `archiveOrganization({ organizationId })` | Archive; freeze memberships policy |
| `deleteOrganization({ organizationId })` | Soft-delete (strict checks) |
| `renameOrganization({ organizationId, name, slug? })` | Update profile |
| `transferOwnership({ organizationId, fromPrincipalId, toPrincipalId })` | Requires `to` active member; emit `owner_transferred` |

### 8.2 Location commands

| API | Behavior |
| --- | --- |
| `addLocation({ organizationId, name, code, … })` | Add location entity |
| `updateLocation({ organizationId, locationId, … })` | Update |
| `deactivateLocation({ organizationId, locationId })` | Soft-disable |

### 8.3 Membership commands

| API | Behavior |
| --- | --- |
| `addMembership({ organizationId, principalId, locationId? })` | Direct add (admin); state `active` (or `invited` if policy requires) |
| `activateMembership({ organizationId, principalId })` | → `active` |
| `suspendMembership({ organizationId, principalId, reason })` | → `suspended` |
| `removeMembership({ organizationId, principalId, reason })` | → `removed`; block if sole owner |
| `leaveOrganization({ organizationId, principalId })` | → `left`; block if sole owner |
| `setMembershipLocation({ organizationId, principalId, locationId? })` | Scope change |

### 8.4 Invitation commands

| API | Behavior |
| --- | --- |
| `createInvitation({ organizationId, email, invitedByPrincipalId, locationId?, suggestedRoleKey? })` | Pending invite + token |
| `revokeInvitation({ invitationId, revokedByPrincipalId })` | Revoke |
| `acceptInvitation({ token, principalId })` | Validate principal via Identity facade; create/activate membership; mark accepted |
| `declineInvitation({ token, principalId? })` | Decline |

### 8.5 Queries

| API | Behavior |
| --- | --- |
| `getOrganization(organizationId)` | Org profile + status + ownerPrincipalId |
| `listLocations(organizationId)` | Locations |
| `getMembership(organizationId, principalId)` | Membership or null |
| `listMembershipsForOrganization(organizationId, filters?)` | Members |
| `listOrganizationsForPrincipal(principalId)` | Orgs where membership is active (or include states) |
| `resolveTenantContext({ principalId, organizationId, locationId? })` | Validates membership + location; returns `TenantContext` or error |
| `getInvitationByToken(token)` | Public accept page data (minimal) |

### 8.6 HTTP surface (illustrative)

- `POST /v1/organizations`
- `GET /v1/organizations/:organizationId`
- `POST /v1/organizations/:organizationId/locations`
- `GET /v1/organizations/:organizationId/members`
- `POST /v1/organizations/:organizationId/invitations`
- `POST /v1/invitations/accept`
- `POST /v1/invitations/decline`
- `POST /v1/organizations/:organizationId/transfer-ownership`

Guards eventually combine Identity session + Tenancy membership + RBAC permission checks.

---

## 9. Dependencies

### 9.1 Module dependencies

| Direction | Module | Notes |
| --- | --- | --- |
| **Depends on** | `identity` (**facade only**) | Validate/resolve `PrincipalId` on create-org owner, accept-invite, transfer-ownership |
| **Does not depend on** | `rbac`, `parties`, products | Role assignment is rbac’s reaction to events / app orchestration |
| **Used by** | `rbac`, shared business modules, products | Via `OrganizationId` / `LocationId` / membership queries |

```text
identity (no deps)
    ▲
    │ facade queries only
tenancy
    ▲
    │ OrganizationId + membership
rbac / shared domains / products
```

### 9.2 Ports / technical

| Port | Purpose |
| --- | --- |
| `IdentityDirectory` (anti-corruption) | Wraps Identity facade: `assertPrincipalExists`, `getUserById` |
| `EventPublisher` / outbox | Domain events |
| `TokenGenerator` | Invitation tokens |
| `Clock` / `IdGenerator` | Standard |
| `EmailSender` or notifications adapter | Invitation emails (prefer publish event → notifications) |

### 9.3 What Tenancy stores about people

| Allowed | Forbidden |
| --- | --- |
| `principalId` on membership / ownership | Password hashes, sessions, MFA secrets |
| Invitee `email` on **invitation only** | Treating email as durable user FK |
| Display cache fields only if justified by ADR | Full user profile replica |

---

## 10. Membership lifecycle

### 10.1 States

| State | Meaning |
| --- | --- |
| `invited` | Membership placeholder awaiting accept (optional; invitations may exist without membership row until accept) |
| `active` | Full member; may establish tenant context |
| `suspended` | Temporarily cannot act in org |
| `left` | Voluntary exit (terminal) |
| `removed` | Admin removal (terminal) |

**Recommendation:** On `createInvitation`, do **not** create a membership row until accept (keeps one source of truth). On accept → create Membership `active`. If product needs “pending member list,” query pending **invitations** instead of `invited` membership. Retain `invited` state only if direct `addMembership` in pending mode is required.

### 10.2 Transitions

```text
                    createInvitation
                          │
                          ▼
                    Invitation(pending)
                     /        \
            accept /          \ decline|revoke|expire
                  ▼            ▼
           Membership        (invitation terminal)
            (active)
            /    |    \
   suspend /     |     \ leave|remove
          ▼      |      ▼
     suspended   |    left|removed (terminal)
          \      |
           activate
              ▼
           active

Ownership transfer: requires target membership == active
Cannot leave/remove if principal is sole owner (transfer first)
```

### 10.3 Rules summary

1. Only `active` memberships pass `resolveTenantContext` (unless explicitly elevating read-only suspended — default deny).
2. Suspended org ⇒ all tenant contexts fail writes (application policy).
3. Terminal memberships are immutable except for audit/history queries.
4. Re-invite after `left`/`removed` creates a **new** invitation / new membership cycle.

---

## 11. Database ownership

Tenancy owns all `tenancy_*` tables. No other module may write them. Identity never reads these tables directly for auth decisions.

| Table | Contents |
| --- | --- |
| `tenancy_organizations` | id, name, slug, status, owner_principal_id, created_at, updated_at, deleted_at, … |
| `tenancy_locations` | id, organization_id, name, code, status, timezone, address fields, created_at, updated_at |
| `tenancy_memberships` | id, organization_id, principal_id, location_id nullable, state, joined_at, updated_at; UNIQUE(organization_id, principal_id) where state not terminal — or unique among active/suspended |
| `tenancy_invitations` | id, organization_id, email_normalized, token_hash, state, invited_by_principal_id, location_id?, suggested_role_key?, expires_at, accepted_by_principal_id?, created_at, … |

**Indexes (intent):** unique slug; `(organization_id, code)` for locations; `(organization_id, principal_id)` for memberships; `token_hash` for invitations; `(principal_id, state)` for “list orgs for principal.”

**Cross-module references:** Higher modules store `organization_id` / `location_id` as opaque ids — prefer **no FK** into `tenancy_*` from other modules without ADR ([module standard](../../architecture/module-standard.md)).

---

## 12. Integration with Identity (without Identity depending on Tenancy)

### 12.1 Dependency direction

```text
┌─────────────┐         facade         ┌─────────────┐
│  identity   │ ◄───────────────────── │   tenancy   │
│  (kernel)   │   PrincipalId + queries│             │
└─────────────┘                        └─────────────┘
       ▲                                        │
       │ sessions                               │ OrganizationId
       │                                        ▼
┌─────────────┐                        ┌─────────────┐
│  apps / API │ ──── authn then ─────► │ rbac / biz  │
└─────────────┘      tenant resolve    └─────────────┘
```

Identity has **zero** imports of Tenancy. No `organizationId` on Identity `User`. No membership checks inside Identity login (login proves who you are; apps then select org).

### 12.2 Typical application orchestration

**Create first organization (post-register):**

1. `identity.registerLocalUser` → `PrincipalId`
2. `identity` session issued
3. App calls `tenancy.createOrganization({ ownerPrincipalId })`
4. App may call `rbac.assignRole(owner, org, 'organization.owner')` (future)

**Invite flow:**

1. Admin (authenticated) → `tenancy.createInvitation({ email })`
2. Email sent with token (event → notifications)
3. Invitee registers/logs in via **Identity** (if new user)
4. Invitee calls `tenancy.acceptInvitation({ token, principalId })`
5. Tenancy calls `identity.getUserById(principalId)` (or assert exists) — **Tenancy → Identity only**
6. Membership `active`; event for rbac default roles

**Request authorization path:**

1. Identity: `resolveSession(token)` → `principalId`
2. Tenancy: `resolveTenantContext({ principalId, organizationId, locationId? })`
3. RBAC: `authorize(principalId, permission, { organizationId, … })`

### 12.3 Events Identity may emit that Tenancy consumes

Tenancy **may** subscribe to Identity events without Identity knowing Tenancy exists:

| Identity event | Tenancy reaction (optional) |
| --- | --- |
| `identity.user.deleted` | Suspend/remove memberships; block invites for that principal |
| `identity.user.suspended` | Optionally suspend memberships (policy) |

Handlers live in Tenancy (`src/events/handlers`), are idempotent, and never write Identity tables.

### 12.4 Anti-patterns (banned)

| Banned | Why |
| --- | --- |
| Identity imports Tenancy to “check org on login” | Breaks kernel dependency rule |
| Storing email on membership as source of truth | Drifts from Identity; use `PrincipalId` |
| Tenancy writing `identity_users` | Cross-module write |
| Embedding RBAC permission arrays on membership | Belongs in `rbac` |
| Requiring organizationId to create a user | Prevents global principal / multi-org users |

---

## 13. Security & isolation

1. All membership mutations require authorized caller (RBAC) once rbac exists; until then, host-level checks.
2. `resolveTenantContext` is mandatory before tenant-owned writes in higher modules.
3. Invitation accept binds to the authenticated `principalId` — do not trust client-supplied email alone.
4. Ownership transfer is dual-controlled (from must be current owner or platform break-glass with audit).
5. Cross-tenant access only via documented break-glass + audit ([tenancy model](../../architecture/tenancy-model.md)).

---

## 14. Testing requirements (when implemented)

| Layer | Focus |
| --- | --- |
| Unit | Membership transitions; owner cannot leave; location must belong to org |
| Integration | Unique membership; invitation consume-once; tenant context denial for suspended member |
| Cross-module | Tenancy handler on `identity.user.deleted`; facade-only Identity mocks — no Identity DB access |
| Isolation | Ensure queries always filter by `organization_id` in higher-module tests (consumer duty) |

---

## 15. Implementation roadmap (non-binding)

1. Organization + owner membership + locations
2. Invitations + accept/decline/revoke
3. Suspend/remove/leave + ownership transfer
4. Identity-event consumers for user deletion
5. Entitlement checks via `billing` facade (optional)

---

## 16. Related documents

- [Identity design](../identity/design.md)
- [Domain map — tenancy](../../architecture/domain-map.md)
- [Tenancy model](../../architecture/tenancy-model.md)
- [ADR-0001](../../adr/0001-platform-technology-foundation.md) / [ADR-0002](../../adr/0002-domain-map.md)
- [Module standard](../../architecture/module-standard.md)
- [Authz model](../../architecture/authz-model.md)
- [Eventing](../../architecture/eventing.md)
