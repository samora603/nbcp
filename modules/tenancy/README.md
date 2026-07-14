# `@nbcp/tenancy`

Core **Tenancy** module (WP-03 / M3): organizations, locations, memberships, invitations.

## Dependencies

* `@nbcp/outbox` — SECURITY/BUSINESS event publication
* `@nbcp/identity` — **public facade only** (`getUserById`, `isAuthenticationAllowed`)

Must **not** import RBAC, Audit, or Identity internals.

## Invitation policy

`acceptInvitation` enforces email bind:
`normalize(invite email) === normalize(principal email)` or deny (`INVITATION_EMAIL_MISMATCH`).

## Usage

```ts
import { createIdentityKernel } from "@nbcp/identity";
import { createTenancyKernel } from "@nbcp/tenancy";

const identity = createIdentityKernel();
const { user, verificationToken } = await identity.service.registerLocalUser({
  email: "owner@example.com",
  password: "password1",
});
await identity.service.verifyEmail({
  principalId: user.principalId,
  token: verificationToken,
});

const tenancy = createTenancyKernel({ identity: identity.service });
await tenancy.service.createOrganization({
  name: "Acme",
  ownerPrincipalId: user.principalId,
});
```
