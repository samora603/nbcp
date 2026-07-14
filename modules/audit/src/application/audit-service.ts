import { randomUUID } from "node:crypto";
import type { DomainEventEnvelope, UnitOfWork } from "@nbcp/outbox";
import type { AuditRuntime, AuditQuery, AuditQueryResult } from "./ports.js";
import type {
  Actor,
  AuditMetadata,
  AuditOutcome,
  AuditRecord,
  AuditRecordView,
  TargetRef,
} from "../domain/audit-record.js";
import { toAuditRecordView } from "../domain/audit-record.js";
import { AuditEventTypes } from "../domain/events.js";
import {
  NotFoundError,
  RetentionError,
  ValidationError,
} from "../domain/errors.js";
import { redactMetadata } from "../domain/redaction.js";
import { projectEnvelopeToAudit } from "./project-envelope.js";

export interface AppendAuditCommand {
  actor: Actor;
  action: string;
  target?: TargetRef | null;
  organizationId?: string | null;
  locationId?: string | null;
  metadata?: AuditMetadata;
  occurredAt?: string;
  correlationId?: string | null;
  outcome?: AuditOutcome;
  sourceModule: string;
  sourceEventId?: string | null;
  eventClass?: AuditRecord["eventClass"];
}

/**
 * Audit application facade (WP-05).
 * Append-only SoR; SECURITY projections via {@link ingestEnvelope}.
 * Does not authorize — host enforces `audit.read`.
 */
export class AuditService {
  constructor(private readonly runtime: AuditRuntime) {}

  private publish(
    uow: UnitOfWork,
    type: string,
    organizationId: string | null,
    payload: Record<string, unknown>,
  ): DomainEventEnvelope {
    const envelope: DomainEventEnvelope = {
      eventId: randomUUID(),
      type,
      version: 1,
      occurredAt: this.runtime.clock.now(),
      producer: "audit",
      organizationId,
      correlationId: null,
      payload,
    };
    this.runtime.outbox.append(uow, envelope);
    return envelope;
  }

  async record(input: AppendAuditCommand): Promise<AuditRecordView> {
    if (!input.action?.trim()) {
      throw new ValidationError("action required");
    }
    if (!input.sourceModule?.trim()) {
      throw new ValidationError("sourceModule required");
    }
    if (!input.actor?.kind) {
      throw new ValidationError("actor.kind required");
    }

    if (input.sourceEventId) {
      const existing = await this.runtime.records.findBySourceEventId(
        input.sourceEventId,
      );
      if (existing) {
        return toAuditRecordView(existing);
      }
    }

    const uow = this.runtime.uowFactory.start();
    const now = this.runtime.clock.now();
    const record: AuditRecord = {
      auditRecordId: this.runtime.ids.id(),
      actor: {
        kind: input.actor.kind,
        principalId: input.actor.principalId ?? null,
        displayLabel: input.actor.displayLabel ?? null,
      },
      action: input.action.trim(),
      target: input.target ?? null,
      organizationId: input.organizationId ?? null,
      locationId: input.locationId ?? null,
      metadata: redactMetadata(input.metadata ?? {}),
      occurredAt: input.occurredAt ?? now,
      recordedAt: now,
      correlationId: input.correlationId ?? null,
      outcome: input.outcome ?? "success",
      sourceModule: input.sourceModule.trim(),
      sourceEventId: input.sourceEventId ?? null,
      eventClass: input.eventClass ?? null,
      archivedAt: null,
    };

    try {
      await this.runtime.records.append(uow, record);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("duplicate sourceEventId") && input.sourceEventId) {
        const existing = await this.runtime.records.findBySourceEventId(
          input.sourceEventId,
        );
        if (existing) {
          await uow.rollback();
          return toAuditRecordView(existing);
        }
      }
      await uow.rollback();
      throw err;
    }

    if (this.runtime.emitRecordAppended) {
      this.publish(uow, AuditEventTypes.RecordAppended, record.organizationId, {
        auditRecordId: record.auditRecordId,
        action: record.action,
        sourceEventId: record.sourceEventId,
      });
    }

    await uow.commit();
    return toAuditRecordView(record);
  }

  async recordMany(inputs: AppendAuditCommand[]): Promise<AuditRecordView[]> {
    const out: AuditRecordView[] = [];
    for (const input of inputs) {
      out.push(await this.record(input));
    }
    return out;
  }

  /**
   * Project a domain event into the audit trail.
   * Idempotent on envelope.eventId (duplicate ⇒ same logical effect).
   */
  async ingestEnvelope(
    envelope: DomainEventEnvelope,
  ): Promise<AuditRecordView | null> {
    const projected = projectEnvelopeToAudit(envelope);
    if (!projected) {
      return null;
    }
    return this.record({
      actor: projected.actor,
      action: projected.action,
      target: projected.target,
      organizationId: projected.organizationId,
      locationId: projected.locationId,
      metadata: projected.metadata,
      occurredAt: projected.occurredAt,
      correlationId: projected.correlationId,
      outcome: projected.outcome,
      sourceModule: projected.sourceModule,
      sourceEventId: projected.sourceEventId,
      eventClass: projected.eventClass,
    });
  }

  /**
   * Append a correction that references a prior record — never mutates the original.
   */
  async appendCorrection(input: {
    priorAuditRecordId: string;
    actor: Actor;
    action?: string;
    metadata?: AuditMetadata;
    sourceModule: string;
  }): Promise<AuditRecordView> {
    const prior = await this.runtime.records.findById(input.priorAuditRecordId);
    if (!prior) {
      throw new NotFoundError(
        `audit record not found: ${input.priorAuditRecordId}`,
      );
    }
    return this.record({
      actor: input.actor,
      action: input.action ?? "audit.correction.appended",
      target: {
        type: "audit.record",
        id: prior.auditRecordId,
      },
      organizationId: prior.organizationId,
      locationId: prior.locationId,
      metadata: {
        ...redactMetadata(input.metadata ?? {}),
        correctionOf: prior.auditRecordId,
      },
      sourceModule: input.sourceModule,
      outcome: "success",
      eventClass: "AUDIT",
    });
  }

  async getById(input: {
    auditRecordId: string;
    organizationId?: string | null;
  }): Promise<AuditRecordView | null> {
    const record = await this.runtime.records.findById(input.auditRecordId);
    if (!record) return null;
    if (
      input.organizationId !== undefined &&
      input.organizationId !== null &&
      record.organizationId !== input.organizationId
    ) {
      return null;
    }
    return toAuditRecordView(record);
  }

  /**
   * Tenant-scoped query. Pass `requireOrganizationScope: true` for investigator reads.
   * Host must enforce `audit.read` before calling.
   */
  async query(filter: AuditQuery): Promise<AuditQueryResult & { views: AuditRecordView[] }> {
    if (filter.requireOrganizationScope && !filter.organizationId) {
      throw new ValidationError(
        "organizationId required for tenant-scoped audit query",
      );
    }
    const result = await this.runtime.records.query(filter);
    return {
      ...result,
      views: result.records.map(toAuditRecordView),
    };
  }

  /**
   * Archive-then-purge posture (ADR-0004). Archive only moves retention state;
   * does not wipe history for rebuild.
   */
  async archiveRecords(input: {
    auditRecordIds: string[];
    organizationId?: string | null;
    actorPrincipalId?: string | null;
  }): Promise<{ archived: number }> {
    if (input.auditRecordIds.length === 0) {
      return { archived: 0 };
    }
    const now = this.runtime.clock.now();
    const uow = this.runtime.uowFactory.start();
    const archived = await this.runtime.records.markArchived(
      input.auditRecordIds,
      now,
    );
    this.publish(uow, AuditEventTypes.RetentionArchived, input.organizationId ?? null, {
      auditRecordIds: input.auditRecordIds,
      archivedCount: archived,
      actorPrincipalId: input.actorPrincipalId ?? null,
    });
    await uow.commit();
    return { archived };
  }

  /**
   * Purge archived rows only — dual-control flag required (ops).
   * Never use this for Reporting-style truncate+rebuild of Audit SoR.
   */
  async purgeArchivedRecords(input: {
    auditRecordIds: string[];
    dualControlApproved: boolean;
    organizationId?: string | null;
    actorPrincipalId?: string | null;
  }): Promise<{ purged: number }> {
    if (!input.dualControlApproved) {
      throw new RetentionError(
        "purge requires dualControlApproved (ADR-0004 / audit retention)",
      );
    }
    for (const id of input.auditRecordIds) {
      const r = await this.runtime.records.findById(id);
      if (r && !r.archivedAt) {
        throw new RetentionError(
          `record not archived — archive before purge: ${id}`,
        );
      }
    }
    const uow = this.runtime.uowFactory.start();
    const purged = await this.runtime.records.purgeArchived(
      input.auditRecordIds,
    );
    this.publish(uow, AuditEventTypes.RetentionPurged, input.organizationId ?? null, {
      auditRecordIds: input.auditRecordIds,
      purgedCount: purged,
      actorPrincipalId: input.actorPrincipalId ?? null,
      dualControlApproved: true,
    });
    await uow.commit();
    return { purged };
  }

  async countRecords(): Promise<number> {
    return this.runtime.records.count();
  }
}
