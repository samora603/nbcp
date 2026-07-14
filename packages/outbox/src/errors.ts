export class OutboxError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "OutboxError";
    this.code = code;
  }
}

export class EnvelopeValidationError extends OutboxError {
  constructor(message: string) {
    super("ENVELOPE_INVALID", message);
    this.name = "EnvelopeValidationError";
  }
}

export class DuplicateEventIdError extends OutboxError {
  constructor(eventId: string) {
    super(
      "DUPLICATE_EVENT_ID",
      `Outbox already contains eventId "${eventId}"`,
    );
    this.name = "DuplicateEventIdError";
  }
}

export class InactiveUnitOfWorkError extends OutboxError {
  constructor() {
    super(
      "UOW_INACTIVE",
      "Outbox append requires an active unit of work",
    );
    this.name = "InactiveUnitOfWorkError";
  }
}

export class UnitOfWorkStateError extends OutboxError {
  constructor(message: string) {
    super("UOW_STATE", message);
    this.name = "UnitOfWorkStateError";
  }
}
