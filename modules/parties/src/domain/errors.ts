export class PartiesError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "PartiesError";
    this.code = code;
  }
}

export class ConflictError extends PartiesError {
  constructor(message: string) {
    super("CONFLICT", message);
    this.name = "ConflictError";
  }
}

export class NotFoundError extends PartiesError {
  constructor(message: string) {
    super("NOT_FOUND", message);
    this.name = "NotFoundError";
  }
}

export class ValidationError extends PartiesError {
  constructor(message: string) {
    super("VALIDATION", message);
    this.name = "ValidationError";
  }
}

export class AuthorizationError extends PartiesError {
  constructor(message: string) {
    super("FORBIDDEN", message);
    this.name = "AuthorizationError";
  }
}
