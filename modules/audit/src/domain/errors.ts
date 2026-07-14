export class AuditError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "AuditError";
    this.code = code;
  }
}

export class ValidationError extends AuditError {
  constructor(message: string) {
    super("VALIDATION", message);
    this.name = "ValidationError";
  }
}

export class NotFoundError extends AuditError {
  constructor(message: string) {
    super("NOT_FOUND", message);
    this.name = "NotFoundError";
  }
}

export class ConflictError extends AuditError {
  constructor(message: string) {
    super("CONFLICT", message);
    this.name = "ConflictError";
  }
}

export class RetentionError extends AuditError {
  constructor(message: string) {
    super("RETENTION", message);
    this.name = "RetentionError";
  }
}
