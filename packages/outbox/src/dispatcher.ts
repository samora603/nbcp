import type { DomainEventEnvelope } from "./envelope.js";

/**
 * Dispatches a published envelope to consumers / bus.
 * At-least-once: may be invoked more than once for the same eventId.
 */
export interface EventDispatcher {
  dispatch(envelope: DomainEventEnvelope): Promise<void>;
}

/**
 * Collects dispatches for tests and simple in-process wiring.
 */
export class InProcessEventDispatcher implements EventDispatcher {
  readonly delivered: DomainEventEnvelope[] = [];
  private readonly handlers: Array<
    (envelope: DomainEventEnvelope) => Promise<void>
  > = [];

  subscribe(
    handler: (envelope: DomainEventEnvelope) => Promise<void>,
  ): void {
    this.handlers.push(handler);
  }

  async dispatch(envelope: DomainEventEnvelope): Promise<void> {
    this.delivered.push(structuredClone(envelope));
    for (const handler of this.handlers) {
      await handler(envelope);
    }
  }
}
