# `@nbcp/identity`

Core **Identity** module (WP-02 / M2): principals, local credentials, sessions, password reset, external identity links.

## Invariants

* Depends only on `@nbcp/outbox` (technical) — **zero** `modules/*` dependencies
* SECURITY mutations publish via transactional outbox in the same unit of work
* No Tenancy / RBAC / Audit imports

## Facade

```ts
import { createIdentityKernel } from "@nbcp/identity";

const { service, outboxStore } = createIdentityKernel();
const { user, verificationToken } = await service.registerLocalUser({
  email: "a@example.com",
  password: "password1",
});
await service.verifyEmail({
  principalId: user.principalId,
  token: verificationToken,
});
```

## Permissions

Exported constants (`IdentityPermissions`) match [permission-catalog.md](../../docs/reference/permission-catalog.md). Host/RBAC enforces them later.

## Policy

* [identity/design.md](../../docs/modules/identity/design.md)
* ADR-0003 / ADR-0006 · Event catalog Identity section
