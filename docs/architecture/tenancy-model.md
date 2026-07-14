# Tenancy Model

## Decision

NBCP is **multi-tenant**. The primary tenant boundary is an **Organization**.

## Principles

1. Every business row that belongs to a customer carries an organization scope (e.g., `organization_id`).
2. Isolation is enforced in **application and data-access layers**, not only in controllers.
3. Cross-tenant access is forbidden except via explicit break-glass flows with full audit.
4. Early implementation preference: **shared schema with row-level tenant predicates**. Schema-per-tenant is deferred unless a regulated vertical mandates it.
5. Optional **locations/branches** nest under an organization for multi-site operations.

## Implications for future phases

- Repository helpers and query policies must apply tenant filters by default.
- Integration tests must prove isolation for every module owning tenant data.
- Reporting and exports must never silently cross tenants.

## Status

Row-level multi-tenancy principles remain as above.

**Access composition** (membership vs RBAC location vs owner bootstrap): see [`tenant-access-model.md`](tenant-access-model.md).  
**Invitation accept / email bind:** see [`invitation-acceptance-policy.md`](invitation-acceptance-policy.md).

Schemas, middleware, and enforcement land in Phase 1+.
