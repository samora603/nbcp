import type { UnitOfWork } from "@nbcp/outbox";
import type { AuditRecord } from "../domain/audit-record.js";
import type {
  AuditQuery,
  AuditQueryResult,
  AuditRecordRepository,
} from "../application/ports.js";

export class InMemoryAuditRecordRepository implements AuditRecordRepository {
  private readonly byId = new Map<string, AuditRecord>();
  private readonly bySourceEventId = new Map<string, string>();

  async append(_uow: UnitOfWork | null, record: AuditRecord): Promise<void> {
    if (this.byId.has(record.auditRecordId)) {
      throw new Error(`duplicate auditRecordId: ${record.auditRecordId}`);
    }
    if (record.sourceEventId) {
      const existing = this.bySourceEventId.get(record.sourceEventId);
      if (existing) {
        throw new Error(
          `duplicate sourceEventId: ${record.sourceEventId}`,
        );
      }
      this.bySourceEventId.set(record.sourceEventId, record.auditRecordId);
    }
    this.byId.set(record.auditRecordId, structuredClone(record));
  }

  async findById(auditRecordId: string): Promise<AuditRecord | null> {
    const r = this.byId.get(auditRecordId);
    return r ? structuredClone(r) : null;
  }

  async findBySourceEventId(
    sourceEventId: string,
  ): Promise<AuditRecord | null> {
    const id = this.bySourceEventId.get(sourceEventId);
    if (!id) return null;
    return this.findById(id);
  }

  async query(filter: AuditQuery): Promise<AuditQueryResult> {
    let rows = [...this.byId.values()];
    if (!filter.includeArchived) {
      rows = rows.filter((r) => r.archivedAt === null);
    }
    if (filter.requireOrganizationScope) {
      if (!filter.organizationId) {
        return { records: [], nextCursor: null };
      }
    }
    if (filter.organizationId !== undefined && filter.organizationId !== null) {
      rows = rows.filter((r) => r.organizationId === filter.organizationId);
    }
    if (filter.locationId) {
      rows = rows.filter((r) => r.locationId === filter.locationId);
    }
    if (filter.actorPrincipalId) {
      rows = rows.filter(
        (r) => r.actor.principalId === filter.actorPrincipalId,
      );
    }
    if (filter.action) {
      rows = rows.filter((r) => r.action === filter.action);
    }
    if (filter.actionPrefix) {
      const prefix = filter.actionPrefix;
      rows = rows.filter((r) => r.action.startsWith(prefix));
    }
    if (filter.targetType) {
      rows = rows.filter((r) => r.target?.type === filter.targetType);
    }
    if (filter.targetId) {
      rows = rows.filter((r) => r.target?.id === filter.targetId);
    }
    if (filter.sourceEventId) {
      rows = rows.filter((r) => r.sourceEventId === filter.sourceEventId);
    }
    if (filter.correlationId) {
      rows = rows.filter((r) => r.correlationId === filter.correlationId);
    }
    if (filter.occurredFrom) {
      const from = filter.occurredFrom;
      rows = rows.filter((r) => r.occurredAt >= from);
    }
    if (filter.occurredTo) {
      const to = filter.occurredTo;
      rows = rows.filter((r) => r.occurredAt <= to);
    }

    rows.sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : -1));

    let start = 0;
    if (filter.cursor) {
      const idx = rows.findIndex((r) => r.auditRecordId === filter.cursor);
      start = idx >= 0 ? idx + 1 : 0;
    }
    const limit = filter.limit ?? 50;
    const slice = rows.slice(start, start + limit);
    const next =
      start + limit < rows.length
        ? (slice[slice.length - 1]?.auditRecordId ?? null)
        : null;

    return {
      records: slice.map((r) => structuredClone(r)),
      nextCursor: next,
    };
  }

  async markArchived(
    auditRecordIds: string[],
    archivedAt: string,
  ): Promise<number> {
    let n = 0;
    for (const id of auditRecordIds) {
      const r = this.byId.get(id);
      if (!r || r.archivedAt) continue;
      this.byId.set(id, { ...r, archivedAt });
      n += 1;
    }
    return n;
  }

  async purgeArchived(auditRecordIds: string[]): Promise<number> {
    let n = 0;
    for (const id of auditRecordIds) {
      const r = this.byId.get(id);
      if (!r || !r.archivedAt) continue;
      if (r.sourceEventId) {
        this.bySourceEventId.delete(r.sourceEventId);
      }
      this.byId.delete(id);
      n += 1;
    }
    return n;
  }

  async count(): Promise<number> {
    return this.byId.size;
  }
}
