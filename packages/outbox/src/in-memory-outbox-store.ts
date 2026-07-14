import type { DomainEventEnvelope } from "./envelope.js";
import type { OutboxRecord, OutboxQuery, OutboxStore } from "./outbox-store.js";
import type { OutboxRecordStatus } from "./outbox-store.js";
import { DuplicateEventIdError } from "./errors.js";

/**
 * In-memory outbox store for tests and local scaffolding.
 * Production adapters will implement {@link OutboxStore} against the platform DB.
 */
export class InMemoryOutboxStore implements OutboxStore {
  private readonly byId = new Map<string, OutboxRecord>();

  async hasEventId(eventId: string): Promise<boolean> {
    return this.byId.has(eventId);
  }

  async insertUnpublished(records: readonly OutboxRecord[]): Promise<void> {
    for (const record of records) {
      if (this.byId.has(record.envelope.eventId)) {
        throw new DuplicateEventIdError(record.envelope.eventId);
      }
    }
    for (const record of records) {
      this.byId.set(record.envelope.eventId, structuredClone(record));
    }
  }

  async listUnpublished(limit: number): Promise<OutboxRecord[]> {
    return [...this.byId.values()]
      .filter((r) => r.status === "unpublished")
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .slice(0, limit)
      .map((r) => structuredClone(r));
  }

  async markPublished(eventId: string, publishedAt: string): Promise<void> {
    const existing = this.byId.get(eventId);
    if (!existing) {
      return;
    }
    existing.status = "published";
    existing.publishedAt = publishedAt;
    existing.lastError = null;
  }

  async recordAttemptFailure(
    eventId: string,
    errorMessage: string,
    poison: boolean,
  ): Promise<void> {
    const existing = this.byId.get(eventId);
    if (!existing) {
      return;
    }
    existing.attemptCount += 1;
    existing.lastError = errorMessage;
    if (poison) {
      existing.status = "poison";
    }
  }

  async getByEventId(eventId: string): Promise<OutboxRecord | null> {
    const row = this.byId.get(eventId);
    return row ? structuredClone(row) : null;
  }

  async query(filter: OutboxQuery): Promise<OutboxRecord[]> {
    let rows = [...this.byId.values()];
    if (filter.status !== undefined) {
      rows = rows.filter((r) => r.status === filter.status);
    }
    if (filter.type !== undefined) {
      rows = rows.filter((r) => r.envelope.type === filter.type);
    }
    if (filter.organizationId !== undefined) {
      rows = rows.filter(
        (r) => r.envelope.organizationId === filter.organizationId,
      );
    }
    if (filter.occurredAtFrom !== undefined) {
      const from = filter.occurredAtFrom;
      rows = rows.filter((r) => r.envelope.occurredAt >= from);
    }
    if (filter.occurredAtTo !== undefined) {
      const to = filter.occurredAtTo;
      rows = rows.filter((r) => r.envelope.occurredAt <= to);
    }
    rows.sort((a, b) =>
      a.envelope.occurredAt.localeCompare(b.envelope.occurredAt),
    );
    const limit = filter.limit ?? rows.length;
    return rows.slice(0, limit).map((r) => structuredClone(r));
  }

  async countByStatus(): Promise<Record<OutboxRecordStatus, number>> {
    const counts: Record<OutboxRecordStatus, number> = {
      unpublished: 0,
      published: 0,
      poison: 0,
    };
    for (const row of this.byId.values()) {
      counts[row.status] += 1;
    }
    return counts;
  }

  /** Test helper: all envelopes currently stored. */
  snapshotEnvelopes(): DomainEventEnvelope[] {
    return [...this.byId.values()].map((r) => structuredClone(r.envelope));
  }
}
