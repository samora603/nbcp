# `@nbcp/audit`

Core **Audit** module (WP-05 / M5): append-only security trail projected from Identity / Tenancy / RBAC outbox events.

## Rules

* Append-only SoR — corrections are **new** rows (`appendCorrection`)
* Consumes SECURITY events; FINANCIAL envelopes → **metadata only** (ADR-0005)
* Does **not** authorize reads — host enforces `audit.read`
* Identity / Tenancy / RBAC packages must **not** import Audit

## Usage

```ts
import { createIdentityKernel } from "@nbcp/identity";
import { createTenancyKernel } from "@nbcp/tenancy";
import { createRbacKernel } from "@nbcp/rbac";
import { createAuditKernel } from "@nbcp/audit";

const identity = createIdentityKernel();
const tenancy = createTenancyKernel({
  identity: identity.service,
  outboxStore: identity.outboxStore,
});
const rbac = createRbacKernel({
  identity: identity.service,
  tenancy: tenancy.service,
  outboxStore: identity.outboxStore,
});
const audit = createAuditKernel({ outboxStore: identity.outboxStore });

// …mutations that write outbox…
await audit.relay.processBatch(100);

const page = await audit.service.query({
  organizationId: org.organizationId,
  requireOrganizationScope: true,
});
```

## Replay

Re-delivery is safe: `deliverIdempotent` + unique `sourceEventId`.  
Do **not** truncate Audit SoR and “rebuild” like Reporting (ADR-0004).
