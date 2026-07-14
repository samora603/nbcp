/**
 * Consumer-side idempotency on eventId (ADR-0003 / ADR-0004).
 * Outbox relay is at-least-once; consumers must skip already-processed ids.
 */

export interface ProcessedEventsStore {
  has(consumerName: string, eventId: string): Promise<boolean>;
  mark(consumerName: string, eventId: string): Promise<void>;
}

export class InMemoryProcessedEventsStore implements ProcessedEventsStore {
  private readonly keys = new Set<string>();

  private key(consumerName: string, eventId: string): string {
    return `${consumerName}::${eventId}`;
  }

  async has(consumerName: string, eventId: string): Promise<boolean> {
    return this.keys.has(this.key(consumerName, eventId));
  }

  async mark(consumerName: string, eventId: string): Promise<void> {
    this.keys.add(this.key(consumerName, eventId));
  }
}

export interface IdempotentHandler<TEnvelope> {
  (envelope: TEnvelope): Promise<void>;
}

/**
 * Invokes handler only if eventId not yet processed for this consumer.
 */
export async function deliverIdempotent<TEnvelope extends { eventId: string }>(
  store: ProcessedEventsStore,
  consumerName: string,
  envelope: TEnvelope,
  handler: IdempotentHandler<TEnvelope>,
): Promise<{ applied: boolean }> {
  if (await store.has(consumerName, envelope.eventId)) {
    return { applied: false };
  }
  await handler(envelope);
  await store.mark(consumerName, envelope.eventId);
  return { applied: true };
}
