# `@nbcp/rbac`

Core **RBAC** module (WP-04 / M4): permission catalog, roles, assignments, deny-by-default `authorize`.

## Dependencies

* `@nbcp/outbox` — SECURITY event publication
* `@nbcp/identity` — **public facade only** (`getUserById`)
* `@nbcp/tenancy` — **public facade only** (`getMembership`, `listLocations`)

Must **not** import Audit or Identity/Tenancy internals. No owner permission bypass without assignment.

## Bootstrap

Organization creation stays in Tenancy. The **app composer** (or this facade) grants admin after create:

```ts
import { createIdentityKernel } from "@nbcp/identity";
import { createTenancyKernel } from "@nbcp/tenancy";
import { createRbacKernel } from "@nbcp/rbac";

const identity = createIdentityKernel();
// ... register + verify owner ...
const tenancy = createTenancyKernel({
  identity: identity.service,
  outboxStore: identity.outboxStore,
});
const org = await tenancy.service.createOrganization({
  name: "Acme",
  ownerPrincipalId: owner.principalId,
});
const rbac = createRbacKernel({
  identity: identity.service,
  tenancy: tenancy.service,
  outboxStore: identity.outboxStore,
});
await rbac.ready;
await rbac.service.bootstrapOrganizationAdministrator({
  organizationId: org.organizationId,
  ownerPrincipalId: owner.principalId,
});
```

Bootstrap is the only assignment path that skips `rbac.assignment.manage`.

## Authorize

```ts
const decision = await rbac.service.authorize({
  principalId,
  permissionKey: "tenancy.membership.manage",
  organizationId,
  locationId, // optional; membership.homeLocation ≠ authz scope
});
```
