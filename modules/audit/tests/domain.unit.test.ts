import { describe, expect, it } from "vitest";
import { redactMetadata, METADATA_DENY_LIST } from "../src/domain/redaction.js";
import { classifyEnvelopeType } from "../src/application/event-classification.js";
import { projectEnvelopeToAudit } from "../src/application/project-envelope.js";
import { AuditEventTypes, AUDIT_EVENT_TYPE_SET } from "../src/domain/events.js";
import type { DomainEventEnvelope } from "@nbcp/outbox";

describe("audit domain unit", () => {
  it("redacts deny-listed metadata keys", () => {
    expect(METADATA_DENY_LIST).toContain("password");
    const redacted = redactMetadata({
      password: "secret",
      roleId: "r1",
      token: "abc",
    });
    expect(redacted.password).toBe("[REDACTED]");
    expect(redacted.token).toBe("[REDACTED]");
    expect(redacted.roleId).toBe("r1");
  });

  it("classifies kernel SECURITY and FINANCIAL vs ignore", () => {
    expect(classifyEnvelopeType("identity.user.registered")).toBe("SECURITY");
    expect(classifyEnvelopeType("tenancy.organization.created")).toBe(
      "SECURITY",
    );
    expect(classifyEnvelopeType("rbac.role_assignment.granted")).toBe(
      "SECURITY",
    );
    expect(classifyEnvelopeType("payments.capture.succeeded")).toBe(
      "FINANCIAL",
    );
    expect(classifyEnvelopeType("orders.order.committed")).toBe("IGNORE");
  });

  it("projects SECURITY envelopes; FINANCIAL metadata-only", () => {
    const security: DomainEventEnvelope = {
      eventId: "e1",
      type: "rbac.role_assignment.granted",
      version: 1,
      occurredAt: "2026-07-14T00:00:00.000Z",
      producer: "rbac",
      organizationId: "org1",
      correlationId: null,
      payload: {
        assignmentId: "a1",
        principalId: "p1",
        roleId: "role1",
        password: "nope",
      },
    };
    const projected = projectEnvelopeToAudit(security);
    expect(projected?.action).toBe("rbac.role_assignment.granted");
    expect(projected?.sourceEventId).toBe("e1");
    expect(projected?.metadata.password).toBe("[REDACTED]");
    expect(projected?.target?.type).toBe("rbac.role_assignment");

    const financial: DomainEventEnvelope = {
      ...security,
      eventId: "e2",
      type: "payments.capture.succeeded",
      producer: "payments",
      payload: { captureId: "c1", amount: 999, currency: "USD" },
    };
    const fin = projectEnvelopeToAudit(financial);
    expect(fin?.eventClass).toBe("FINANCIAL");
    expect(fin?.metadata.note).toBe("financial_metadata_only");
    expect(fin?.metadata.amount).toBeUndefined();
  });

  it("audit event types are catalog prefixes", () => {
    for (const t of AUDIT_EVENT_TYPE_SET) {
      expect(t.startsWith("audit.")).toBe(true);
    }
    expect(AuditEventTypes.RetentionPurged).toBe("audit.retention.purged");
  });
});
