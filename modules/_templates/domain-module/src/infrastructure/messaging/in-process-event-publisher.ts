import { Injectable } from '@nestjs/common';
import type {
  DomainEvent,
  EventPublisher,
} from '../../application/ports/event-publisher.port';

/**
 * Placeholder in-process publisher.
 * Production modules should write an outbox in the same transaction as state changes.
 */
@Injectable()
export class InProcessEventPublisher implements EventPublisher {
  async publish(events: DomainEvent[]): Promise<void> {
    for (const event of events) {
      // eslint-disable-next-line no-console
      console.debug('[example] publish', event.type, event.version, event.payload);
    }
  }
}
