import type { DomainEventEnvelope } from "./envelope.js";
import type { UnitOfWork } from "./unit-of-work.js";
import { InactiveUnitOfWorkError } from "./errors.js";

/**
 * Application-facing writer: appends only through an active {@link UnitOfWork}.
 */
export class OutboxWriter {
  append(uow: UnitOfWork, envelope: DomainEventEnvelope): void {
    if (!uow.isActive) {
      throw new InactiveUnitOfWorkError();
    }
    uow.appendOutbox(envelope);
  }
}
