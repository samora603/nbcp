export class LedgerError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "LedgerError";
    this.code = code;
  }
}

export class ConflictError extends LedgerError {
  constructor(message: string) {
    super("CONFLICT", message);
    this.name = "ConflictError";
  }
}

export class NotFoundError extends LedgerError {
  constructor(message: string) {
    super("NOT_FOUND", message);
    this.name = "NotFoundError";
  }
}

export class ValidationError extends LedgerError {
  constructor(message: string) {
    super("VALIDATION", message);
    this.name = "ValidationError";
  }
}

export class AuthorizationError extends LedgerError {
  constructor(message: string) {
    super("FORBIDDEN", message);
    this.name = "AuthorizationError";
  }
}

export class UnbalancedJournalError extends LedgerError {
  constructor(message: string) {
    super("UNBALANCED", message);
    this.name = "UnbalancedJournalError";
  }
}

export class ImmutableJournalError extends LedgerError {
  constructor(message: string) {
    super("IMMUTABLE", message);
    this.name = "ImmutableJournalError";
  }
}
