export class IdentityError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "IdentityError";
    this.code = code;
  }
}

export class ConflictError extends IdentityError {
  constructor(message: string) {
    super("CONFLICT", message);
    this.name = "ConflictError";
  }
}

export class NotFoundError extends IdentityError {
  constructor(message: string) {
    super("NOT_FOUND", message);
    this.name = "NotFoundError";
  }
}

export class AuthenticationError extends IdentityError {
  constructor(reason: string) {
    super("AUTH_FAILED", reason);
    this.name = "AuthenticationError";
  }
}

export class ValidationError extends IdentityError {
  constructor(message: string) {
    super("VALIDATION", message);
    this.name = "ValidationError";
  }
}
