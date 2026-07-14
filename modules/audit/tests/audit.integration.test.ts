import { describe, expect, it } from "vitest";
import { createIdentityKernel } from "@nbcp/identity";
import { createTenancyKernel } from "@nbcp/tenancy";
import { createRbacKernel } from "@nbcp/rbac";
import { TenancyEventTypes } from "@nbcp/tenancy";
import { RbacEventTypes } from "@nbcp/rbac";
import { IdentityEventTypes } from "@nbcp/identity";
import { createAuditKernel } from "../src/application/create-audit-kernel.js";
import { AuditEventTypes } from "../src/domain/events.js";
import { RetentionError } from "../src/domain/errors.js";
import type { DomainEventEnvelope } from "@nbcp/outbox";

async function registerVerified(
  identity: ReturnType<typeof createIdentityKernel>["service"],
  email: string,
) {
  const { user, verificationToken } = await identity.registerLocalUser({
    email,
    password: "password1",
  });
  await identity.verifyEmail({
    principalId: user.principalId,
    token: verificationToken,
  });
  return user;
}

describe("audit integration", () => {
  it("projects kernel SECURITY events via outbox relay (C6/C9)", async () => {
    const identity = createIdentityKernel();
    const owner = await registerVerified(identity.service, "audit@example.com");
    const outboxStore = identity.outboxStore;
    const tenancy = createTenancyKernel({
      identity: identity.service,
      outboxStore,
    });
    const org = await tenancy.service.createOrganization({
      name: "AuditCo",
      ownerPrincipalId: owner.principalId,
    });
    const rbac = createRbacKernel({
      identity: identity.service,
      tenancy: tenancy.service,
      outboxStore,
    });
    await rbac.ready;
    await rbac.service.bootstrapOrganizationAdministrator({
      organizationId: org.organizationId,
      ownerPrincipalId: owner.principalId,
    });

    const audit = createAuditKernel({ outboxStore });
    const batch = await audit.relay.processBatch(200);
    expect(batch.published).toBeGreaterThan(0);

    const page = await audit.service.query({
      organizationId: org.organizationId,
      requireOrganizationScope: true,
      limit: 100,
    });
    const actions = new Set(page.views.map((v) => v.action));
    expect(actions.has(TenancyEventTypes.OrganizationCreated)).toBe(true);
    expect(actions.has(RbacEventTypes.RoleAssignmentGranted)).toBe(true);

    const identityGlobal = await audit.service.query({
      action: IdentityEventTypes.UserRegistered,
      limit: 10,
    });
    expect(identityGlobal.views.length).toBeGreaterThanOrEqual(1);
  });

  it("re-delivery of same eventId does not duplicate audit effect", async () => {
    const identity = createIdentityKernel();
    const owner = await registerVerified(identity.service, "idem@example.com");
    const outboxStore = identity.outboxStore;
    const tenancy = createTenancyKernel({
      identity: identity.service,
      outboxStore,
    });
    await tenancy.service.createOrganization({
      name: "IdemCo",
      ownerPrincipalId: owner.principalId,
    });
    const audit = createAuditKernel({ outboxStore });
    await audit.relay.processBatch(100);
    const afterFirst = await audit.service.countRecords();

    // Simulate at-least-once: handle published envelopes again through ingestor.
    const published = await outboxStore.query({ status: "published" });
    for (const row of published) {
      await audit.ingestor.handle(row.envelope);
    }
    expect(await audit.service.countRecords()).toBe(afterFirst);

    // Replay support with fresh processed store would skip when same consumer?
    // New consumer name simulates new projector generation with sourceEventId uniqueness.
    const again = await audit.service.ingestEnvelope(published[0]!.envelope);
    expect(again?.auditRecordId).toBeDefined();
    expect(await audit.service.countRecords()).toBe(afterFirst);
  });

  it("supports tenant query, correction append, and retention posture", async () => {
    const audit = createAuditKernel();
    const direct = await audit.service.record({
      actor: { kind: "principal", principalId: "p1" },
      action: "tenancy.membership.suspended",
      organizationId: "org-a",
      sourceModule: "host",
      metadata: { password: "x", reason: "policy" },
    });
    expect(direct.metadata.password).toBe("[REDACTED]");
    expect(direct.metadata.reason).toBe("policy");

    const correction = await audit.service.appendCorrection({
      priorAuditRecordId: direct.auditRecordId,
      actor: { kind: "system", displayLabel: "ops" },
      sourceModule: "audit",
      metadata: { note: "clarify" },
    });
    expect(correction.metadata.correctionOf).toBe(direct.auditRecordId);
    const prior = await audit.service.getById({
      auditRecordId: direct.auditRecordId,
    });
    expect(prior?.action).toBe("tenancy.membership.suspended");

    const scoped = await audit.service.query({
      organizationId: "org-a",
      requireOrganizationScope: true,
    });
    expect(scoped.views.length).toBeGreaterThanOrEqual(2);

    await expect(
      audit.service.purgeArchivedRecords({
        auditRecordIds: [direct.auditRecordId],
        dualControlApproved: false,
      }),
    ).rejects.toBeInstanceOf(RetentionError);

    await audit.service.archiveRecords({
      auditRecordIds: [direct.auditRecordId],
      organizationId: "org-a",
    });
    const purged = await audit.service.purgeArchivedRecords({
      auditRecordIds: [direct.auditRecordId],
      dualControlApproved: true,
      organizationId: "org-a",
    });
    expect(purged.purged).toBe(1);

    const retentionEvents = await audit.outboxStore.query({
      type: AuditEventTypes.RetentionPurged,
    });
    expect(retentionEvents.length).toBe(1);
  });

  it("FINANCIAL envelopes project metadata only", async () => {
    const audit = createAuditKernel();
    const envelope: DomainEventEnvelope = {
      eventId: "fin-1",
      type: "ledger.journal.posted",
      version: 1,
      occurredAt: new Date().toISOString(),
      producer: "ledger",
      organizationId: "org-fin",
      correlationId: null,
      payload: {
        journalId: "j1",
        amount: 10000,
        currency: "USD",
      },
    };
    const record = await audit.service.ingestEnvelope(envelope);
    expect(record?.eventClass).toBe("FINANCIAL");
    expect(record?.metadata.note).toBe("financial_metadata_only");
    expect(record?.metadata.amount).toBeUndefined();
  });

  it("replay idempotent path skips already processed events", async () => {
    const identity = createIdentityKernel();
    const owner = await registerVerified(identity.service, "replay@example.com");
    const outboxStore = identity.outboxStore;
    const tenancy = createTenancyKernel({
      identity: identity.service,
      outboxStore,
    });
    await tenancy.service.createOrganization({
      name: "ReplayCo",
      ownerPrincipalId: owner.principalId,
    });
    const audit = createAuditKernel({ outboxStore });
    await audit.relay.processBatch(100);
    const count = await audit.service.countRecords();

    const result = await audit.replay.replayIdempotent(
      { status: "published" },
      audit.processedEvents,
      audit.ingestor.consumerName,
      async (envelope) => {
        await audit.service.ingestEnvelope(envelope);
      },
    );
    expect(result.skippedIdempotent).toBeGreaterThan(0);
    expect(await audit.service.countRecords()).toBe(count);
  });
});
