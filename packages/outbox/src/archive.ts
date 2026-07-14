import type { DomainEventEnvelope } from "./envelope.js";

/**
 * Durable event archive seam (ADR-0004).
 * Full cold object storage may be stubbed; publish must not depend solely on archive.
 */
export interface EventArchive {
  archive(envelope: DomainEventEnvelope): Promise<void>;
}

/** No-op archive — explicit stub for M1 follow-up. */
export class NoopEventArchive implements EventArchive {
  async archive(_envelope: DomainEventEnvelope): Promise<void> {
    // Intentional no-op; track full archive before money-path production.
  }
}

/** In-memory archive for tests and local replay sources. */
export class InMemoryEventArchive implements EventArchive {
  readonly entries: DomainEventEnvelope[] = [];

  async archive(envelope: DomainEventEnvelope): Promise<void> {
    this.entries.push(structuredClone(envelope));
  }
}
