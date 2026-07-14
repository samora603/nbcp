import type { DomainEventEnvelope } from "./envelope.js";

export type OutboxRecordStatus = "unpublished" | "published" | "poison";

/**
 * Durable outbox row: full envelope + relay metadata (ADR-0003 / ADR-0004).
 */
export interface OutboxRecord {
  envelope: DomainEventEnvelope;
  status: OutboxRecordStatus;
  createdAt: string;
  publishedAt: string | null;
  attemptCount: number;
  lastError: string | null;
}

export interface OutboxQuery {
  organizationId?: string | null;
  type?: string;
  status?: OutboxRecordStatus;
  /** Inclusive lower bound on occurredAt (ISO). */
  occurredAtFrom?: string;
  /** Inclusive upper bound on occurredAt (ISO). */
  occurredAtTo?: string;
  limit?: number;
}

export interface OutboxStore {
  /** Returns true if eventId already exists (any status). */
  hasEventId(eventId: string): Promise<boolean>;

  /**
   * Persist records as unpublished.
   * Must be called only as part of a committed unit of work.
   */
  insertUnpublished(records: readonly OutboxRecord[]): Promise<void>;

  listUnpublished(limit: number): Promise<OutboxRecord[]>;

  markPublished(eventId: string, publishedAt: string): Promise<void>;

  recordAttemptFailure(
    eventId: string,
    errorMessage: string,
    poison: boolean,
  ): Promise<void>;

  getByEventId(eventId: string): Promise<OutboxRecord | null>;

  /** Replay / ops query — does not mutate payloads. */
  query(filter: OutboxQuery): Promise<OutboxRecord[]>;

  /** Observability: count by status. */
  countByStatus(): Promise<Record<OutboxRecordStatus, number>>;
}
