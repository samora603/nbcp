import type { DomainEventEnvelope } from "@nbcp/outbox";
import {
  deliverIdempotent,
  type ProcessedEventsStore,
} from "@nbcp/outbox";
import type { AuditService } from "./audit-service.js";
import type { AuditRecordView } from "../domain/audit-record.js";

export const AUDIT_SECURITY_CONSUMER = "audit.security-projector";

export interface AuditEventIngestor {
  /** Idempotent ingest for dispatcher / relay handlers. */
  handle(envelope: DomainEventEnvelope): Promise<{
    applied: boolean;
    record: AuditRecordView | null;
  }>;
  consumerName: string;
}

/**
 * Outbox consumer: at-least-once delivery safe via processed_events + sourceEventId.
 */
export function createAuditEventIngestor(
  audit: AuditService,
  processed: ProcessedEventsStore,
  consumerName: string = AUDIT_SECURITY_CONSUMER,
): AuditEventIngestor {
  return {
    consumerName,
    async handle(envelope) {
      let record: AuditRecordView | null = null;
      const result = await deliverIdempotent(
        processed,
        consumerName,
        envelope,
        async (env) => {
          record = await audit.ingestEnvelope(env);
        },
      );
      if (!result.applied) {
        const existing = await audit.query({
          sourceEventId: envelope.eventId,
          includeArchived: true,
          limit: 1,
        });
        return {
          applied: false,
          record: existing.views[0] ?? null,
        };
      }
      return { applied: true, record };
    },
  };
}
