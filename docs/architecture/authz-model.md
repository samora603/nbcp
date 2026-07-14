# Authorization Model

## Intent

NBCP will use **RBAC** (roles and permissions) as the default authorization model, with room for attribute-based constraints (own records, location scope) where products require them.

## Planned concepts

| Concept | Description |
| --- | --- |
| Permission | Stable `resource.action` string |
| Role | Tenant-scoped grouping of permissions |
| Membership | Links a principal to an organization (and optional location) |
| Policy check | Evaluated in application services, not only at HTTP edge |

## Principles

- Deny by default
- Server-side enforcement is mandatory; UI hiding is not security
- Admin and break-glass paths are auditable
- Product packs may extend the permission catalog without weakening kernel checks

## Status

Design authority for RBAC evaluation and role/permission model: [`docs/modules/rbac/design.md`](../modules/rbac/design.md).

Authentication and authorization **runtimes** are not implemented until Phase 1+ modules are scaffolded.
