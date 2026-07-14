import type { UnitOfWork, UnitOfWorkFactory, OutboxWriter } from "@nbcp/outbox";
import type { AuditRecord } from "../domain/audit-record.js";

export interface Clock {
  now(): string;
}

export interface IdGenerator {
  id(): string;
}

export interface AuditQuery {
  organizationId?: string | null;
  /** When true, require organizationId match (tenant isolation). */
  requireOrganizationScope?: boolean;
  locationId?: string | null;
  actorPrincipalId?: string | null;
  action?: string | null;
  actionPrefix?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  sourceEventId?: string | null;
  correlationId?: string | null;
  occurredFrom?: string | null;
  occurredTo?: string | null;
  includeArchived?: boolean;
  limit?: number;
  cursor?: string | null;
}

export interface AuditQueryResult {
  records: AuditRecord[];
  nextCursor: string | null;
}

/**
 * Append-only repository: insert + select. No content updates.
 * Retention may set archivedAt or delete after archive (ops).
 */
export interface AuditRecordRepository {
  append(uow: UnitOfWork | null, record: AuditRecord): Promise<void>;
  findById(auditRecordId: string): Promise<AuditRecord | null>;
  findBySourceEventId(sourceEventId: string): Promise<AuditRecord | null>;
  query(filter: AuditQuery): Promise<AuditQueryResult>;
  markArchived(
    auditRecordIds: string[],
    archivedAt: string,
  ): Promise<number>;
  purgeArchived(auditRecordIds: string[]): Promise<number>;
  count(): Promise<number>;
}

export interface AuditRuntime {
  uowFactory: UnitOfWorkFactory;
  outbox: OutboxWriter;
  records: AuditRecordRepository;
  ids: IdGenerator;
  clock: Clock;
  /** When true, emit audit.record.appended (default false — high volume). */
  emitRecordAppended?: boolean;
}
