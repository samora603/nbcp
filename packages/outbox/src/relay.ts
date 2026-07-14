import type { OutboxStore } from "./outbox-store.js";
import type { EventDispatcher } from "./dispatcher.js";
import type { EventArchive } from "./archive.js";
import type { OutboxLogger, OutboxMetrics } from "./observability.js";
import { SilentOutboxLogger } from "./observability.js";

export interface OutboxRelayOptions {
  store: OutboxStore;
  dispatcher: EventDispatcher;
  archive: EventArchive;
  /** Attempts before poison quarantine (default 5). */
  maxAttempts?: number;
  metrics?: OutboxMetrics;
  logger?: OutboxLogger;
  now?: () => string;
}

export interface RelayBatchResult {
  attempted: number;
  published: number;
  failed: number;
  poisoned: number;
}

/**
 * Claims unpublished outbox rows and dispatches at-least-once.
 * Marks published only after successful dispatch (+ archive hook).
 */
export class OutboxRelay {
  private readonly maxAttempts: number;
  private readonly logger: OutboxLogger;
  private readonly now: () => string;

  constructor(private readonly options: OutboxRelayOptions) {
    this.maxAttempts = options.maxAttempts ?? 5;
    this.logger = options.logger ?? new SilentOutboxLogger();
    this.now = options.now ?? (() => new Date().toISOString());
  }

  async processBatch(limit: number): Promise<RelayBatchResult> {
    const result: RelayBatchResult = {
      attempted: 0,
      published: 0,
      failed: 0,
      poisoned: 0,
    };

    const pending = await this.options.store.listUnpublished(limit);
    for (const record of pending) {
      result.attempted += 1;
      const { eventId } = record.envelope;
      try {
        await this.options.dispatcher.dispatch(record.envelope);
        await this.options.archive.archive(record.envelope);
        await this.options.store.markPublished(eventId, this.now());
        result.published += 1;
        this.options.metrics?.increment("outbox.relay.success");
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const nextAttempts = record.attemptCount + 1;
        const poison = nextAttempts >= this.maxAttempts;
        await this.options.store.recordAttemptFailure(eventId, message, poison);
        if (poison) {
          result.poisoned += 1;
          this.options.metrics?.increment("outbox.relay.poisoned");
          this.logger.error("Outbox row poisoned", {
            eventId,
            type: record.envelope.type,
            attempts: nextAttempts,
            error: message,
          });
        } else {
          result.failed += 1;
          this.options.metrics?.increment("outbox.relay.failure");
          this.logger.warn("Outbox relay attempt failed", {
            eventId,
            attempts: nextAttempts,
            error: message,
          });
        }
      }
    }

    const counts = await this.options.store.countByStatus();
    this.options.metrics?.gauge("outbox.unpublished", counts.unpublished);
    this.options.metrics?.gauge("outbox.published", counts.published);
    this.options.metrics?.gauge("outbox.poison", counts.poison);

    return result;
  }
}
