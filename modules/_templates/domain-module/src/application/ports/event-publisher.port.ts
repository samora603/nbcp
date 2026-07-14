/**
 * Port for publishing domain events (outbox / in-process bus).
 * Implemented in infrastructure — not by calling other modules’ repositories.
 */
export interface DomainEvent {
  readonly type: string;
  readonly version: number;
  readonly payload: unknown;
}

export interface EventPublisher {
  publish(events: DomainEvent[]): Promise<void>;
}

export const EVENT_PUBLISHER = Symbol('EVENT_PUBLISHER');
