export class PaymentsError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "PaymentsError";
    this.code = code;
  }
}

export class ConflictError extends PaymentsError {
  constructor(message: string) {
    super("CONFLICT", message);
    this.name = "ConflictError";
  }
}

export class NotFoundError extends PaymentsError {
  constructor(message: string) {
    super("NOT_FOUND", message);
    this.name = "NotFoundError";
  }
}

export class ValidationError extends PaymentsError {
  constructor(message: string) {
    super("VALIDATION", message);
    this.name = "ValidationError";
  }
}

export class AuthorizationError extends PaymentsError {
  constructor(message: string) {
    super("FORBIDDEN", message);
    this.name = "AuthorizationError";
  }
}
