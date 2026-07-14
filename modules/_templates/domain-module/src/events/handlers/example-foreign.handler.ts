import { Injectable } from '@nestjs/common';

/**
 * Example consumer stub.
 *
 * Consumes a *foreign* event (from another module) by invoking local use cases.
 * Must be idempotent. Must NOT write another module's tables.
 *
 * Replace `ForeignSomethingHappened` with a real imported event type from that
 * module's public facade — never deep-import their infrastructure.
 */
@Injectable()
export class ExampleForeignEventHandler {
  // constructor(private readonly someLocalUseCase: SomeLocalUseCase) {}

  async handle(_event: { type: string; payload: unknown }): Promise<void> {
    // Idempotency check → map payload → local use case
    void _event;
  }
}
