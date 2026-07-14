import type { DomainEventEnvelope } from "@nbcp/outbox";
import type {
  Actor,
  AuditMetadata,
  AuditOutcome,
  TargetRef,
} from "../domain/audit-record.js";
import {
  classifyEnvelopeType,
  type IngestEventClass,
} from "./event-classification.js";
import { redactMetadata } from "../domain/redaction.js";

export interface ProjectedAuditCommand {
  actor: Actor;
  action: string;
  target: TargetRef | null;
  organizationId: string | null;
  locationId: string | null;
  metadata: AuditMetadata;
  occurredAt: string;
  correlationId: string | null;
  outcome: AuditOutcome;
  sourceModule: string;
  sourceEventId: string;
  eventClass: Exclude<IngestEventClass, "IGNORE">;
}

function payloadString(
  payload: Record<string, unknown>,
  key: string,
): string | null {
  const v = payload[key];
  return typeof v === "string" && v.length > 0 ? v : null;
}

function inferActor(envelope: DomainEventEnvelope): Actor {
  const p = envelope.payload;
  const principalId =
    payloadString(p, "principalId") ??
    payloadString(p, "ownerPrincipalId") ??
    payloadString(p, "assignedByPrincipalId") ??
    payloadString(p, "invitedByPrincipalId") ??
    payloadString(p, "fromPrincipalId") ??
    null;
  if (principalId) {
    return { kind: "principal", principalId, displayLabel: null };
  }
  return { kind: "system", principalId: null, displayLabel: envelope.producer };
}

function inferTarget(envelope: DomainEventEnvelope): TargetRef | null {
  const p = envelope.payload;
  const candidates: Array<[string, string]> = [
    ["assignmentId", "rbac.role_assignment"],
    ["roleId", "rbac.role"],
    ["membershipId", "tenancy.membership"],
    ["invitationId", "tenancy.invitation"],
    ["locationId", "tenancy.location"],
    ["organizationId", "tenancy.organization"],
    ["sessionId", "identity.session"],
    ["principalId", "identity.user"],
    ["userId", "identity.user"],
  ];
  for (const [key, type] of candidates) {
    const id = payloadString(p, key);
    if (id) return { type, id };
  }
  return null;
}

function metadataForClass(
  envelope: DomainEventEnvelope,
  eventClass: IngestEventClass,
): AuditMetadata {
  if (eventClass === "FINANCIAL") {
    // ADR-0005: Audit holds metadata/correlation only — never financial SoR amounts as truth.
    return redactMetadata({
      eventType: envelope.type,
      organizationId: envelope.organizationId,
      producer: envelope.producer,
      version: envelope.version,
      correlationHints: {
        paymentId: envelope.payload.paymentId ?? null,
        journalId: envelope.payload.journalId ?? null,
        captureId: envelope.payload.captureId ?? null,
      },
      note: "financial_metadata_only",
    });
  }
  return redactMetadata({
    ...envelope.payload,
    eventType: envelope.type,
    producer: envelope.producer,
    version: envelope.version,
  });
}

/**
 * Maps a catalog domain event envelope to an append command.
 * Returns null when the type is not consumed by Audit.
 */
export function projectEnvelopeToAudit(
  envelope: DomainEventEnvelope,
): ProjectedAuditCommand | null {
  const eventClass = classifyEnvelopeType(envelope.type);
  if (eventClass === "IGNORE") {
    return null;
  }
  if (eventClass === "AUDIT") {
    // Avoid recursive projection of Audit's own lifecycle events.
    return null;
  }

  const locationId = payloadString(envelope.payload, "locationId");

  return {
    actor: inferActor(envelope),
    action: envelope.type,
    target: inferTarget(envelope),
    organizationId: envelope.organizationId,
    locationId,
    metadata: metadataForClass(envelope, eventClass),
    occurredAt: envelope.occurredAt,
    correlationId: envelope.correlationId,
    outcome: "success",
    sourceModule: envelope.producer,
    sourceEventId: envelope.eventId,
    eventClass,
  };
}
