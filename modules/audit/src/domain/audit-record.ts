export type ActorKind = "principal" | "system" | "automation" | "anonymous";

export interface Actor {
  kind: ActorKind;
  principalId?: string | null;
  displayLabel?: string | null;
}

export type AuditOutcome = "success" | "failure" | "denied";

export interface TargetRef {
  type: string;
  id: string;
}

export type AuditMetadata = Record<string, unknown>;

/**
 * Append-only audit fact. Never updated for content correction —
 * corrections are new rows (metadata.correctionOf).
 */
export interface AuditRecord {
  auditRecordId: string;
  actor: Actor;
  action: string;
  target: TargetRef | null;
  organizationId: string | null;
  locationId: string | null;
  metadata: AuditMetadata;
  occurredAt: string;
  recordedAt: string;
  correlationId: string | null;
  outcome: AuditOutcome;
  sourceModule: string;
  /** Domain event id when projected from outbox — idempotency key. */
  sourceEventId: string | null;
  /** Event classification when ingested from catalog envelope. */
  eventClass: "SECURITY" | "FINANCIAL" | "BUSINESS" | "AUDIT" | "OPERATIONAL" | null;
  archivedAt: string | null;
}

export interface AuditRecordView {
  auditRecordId: string;
  actor: Actor;
  action: string;
  target: TargetRef | null;
  organizationId: string | null;
  locationId: string | null;
  metadata: AuditMetadata;
  occurredAt: string;
  recordedAt: string;
  correlationId: string | null;
  outcome: AuditOutcome;
  sourceModule: string;
  sourceEventId: string | null;
  eventClass: AuditRecord["eventClass"];
  archivedAt: string | null;
}

export function toAuditRecordView(record: AuditRecord): AuditRecordView {
  return structuredClone(record);
}
