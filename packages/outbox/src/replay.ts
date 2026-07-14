import type { DomainEventEnvelope } from "./envelope.js";
import type { OutboxStore, OutboxQuery } from "./outbox-store.js";
import type { EventDispatcher } from "./dispatcher.js";
import type { EventArchive } from "./archive.js";
import type { ProcessedEventsStore } from "./idempotency.js";
import { deliverIdempotent } from "./idempotency.js";

export interface ReplayFilter extends OutboxQuery {
  /** When true, list only — do not dispatch. */
  dryRun?: boolean;
}

export interface ReplayResult {
  matched: number;
  delivered: number;
  skippedIdempotent: number;
  dryRun: boolean;
  envelopes: DomainEventEnvelope[];
}

/**
 * Replay compatibility hooks: re-deliver immutable envelopes without mutating payloads.
 * Ops dual-control lives in runbooks; this is the programmatic substrate.
 */
export class EventReplaySupport {
  constructor(
    private readonly store: OutboxStore,
    private readonly archive?: EventArchive & { entries?: DomainEventEnvelope[] },
  ) {}

  /**
   * Enumerate published (or filtered) outbox envelopes for replay windows.
   */
  async list(filter: ReplayFilter): Promise<DomainEventEnvelope[]> {
    const status = filter.status ?? "published";
    const rows = await this.store.query({ ...filter, status });
    return rows.map((r) => r.envelope);
  }

  /**
   * Re-dispatch published envelopes to a dispatcher.
   * Prefer pairing with {@link deliverIdempotent} at the consumer.
   */
  async replayToDispatcher(
    filter: ReplayFilter,
    dispatcher: EventDispatcher,
  ): Promise<ReplayResult> {
    const envelopes = await this.list(filter);
    if (filter.dryRun) {
      return {
        matched: envelopes.length,
        delivered: 0,
        skippedIdempotent: 0,
        dryRun: true,
        envelopes,
      };
    }

    let delivered = 0;
    for (const envelope of envelopes) {
      await dispatcher.dispatch(envelope);
      delivered += 1;
    }

    return {
      matched: envelopes.length,
      delivered,
      skippedIdempotent: 0,
      dryRun: false,
      envelopes,
    };
  }

  /**
   * Replay into an idempotent consumer handler.
   */
  async replayIdempotent(
    filter: ReplayFilter,
    processed: ProcessedEventsStore,
    consumerName: string,
    handler: (envelope: DomainEventEnvelope) => Promise<void>,
  ): Promise<ReplayResult> {
    const envelopes = await this.list(filter);
    if (filter.dryRun) {
      return {
        matched: envelopes.length,
        delivered: 0,
        skippedIdempotent: 0,
        dryRun: true,
        envelopes,
      };
    }

    let delivered = 0;
    let skipped = 0;
    for (const envelope of envelopes) {
      const result = await deliverIdempotent(
        processed,
        consumerName,
        envelope,
        handler,
      );
      if (result.applied) {
        delivered += 1;
      } else {
        skipped += 1;
      }
    }

    return {
      matched: envelopes.length,
      delivered,
      skippedIdempotent: skipped,
      dryRun: false,
      envelopes,
    };
  }

  /** Optional: envelopes captured by an in-memory archive stub. */
  listArchived(): DomainEventEnvelope[] {
    return this.archive?.entries ? [...this.archive.entries] : [];
  }
}
