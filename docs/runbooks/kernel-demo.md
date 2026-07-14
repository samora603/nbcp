# Kernel demo walkthrough (non-prod)

**Milestone:** M6  
**Purpose:** Prove Identity → Tenancy → RBAC → Audit vertical slice without Nest/Prisma hosts.

## Prerequisites

```bash
pnpm install
pnpm --filter @nbcp/outbox build
pnpm --filter @nbcp/identity build
pnpm --filter @nbcp/tenancy build
pnpm --filter @nbcp/rbac build
pnpm --filter @nbcp/audit build
```

## Steps

1. **Register + verify** a local user (`@nbcp/identity`).  
2. **Create organization** with that principal as owner (`@nbcp/tenancy`) — writes `tenancy.organization.created` to outbox.  
3. **Bootstrap** `organization.administrator` (`@nbcp/rbac.bootstrapOrganizationAdministrator`) — **not** a Tenancy→RBAC import.  
4. **Authorize** a Core permission (e.g. `tenancy.membership.manage`) — must **allow** for admin; **deny** for unassigned member.  
5. **Relay** unpublished outbox rows into `@nbcp/audit` via `createAuditKernel({ outboxStore }).relay.processBatch(...)`.  
6. **Query** audit for the organization — expect SECURITY actions including org create and role assignment grant.

Automated coverage: `modules/audit/tests/audit.integration.test.ts` (“projects kernel SECURITY events via outbox relay”).

## Governance

```bash
pnpm enforce:architecture
```

Must exit 0 (E2–E4 + docs/ADR/permission/outbox gates).
