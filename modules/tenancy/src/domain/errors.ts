export class TenancyError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "TenancyError";
    this.code = code;
  }
}

export class ConflictError extends TenancyError {
  constructor(message: string) {
    super("CONFLICT", message);
    this.name = "ConflictError";
  }
}

export class NotFoundError extends TenancyError {
  constructor(message: string) {
    super("NOT_FOUND", message);
    this.name = "NotFoundError";
  }
}

export class ValidationError extends TenancyError {
  constructor(message: string) {
    super("VALIDATION", message);
    this.name = "ValidationError";
  }
}

export class InvitationEmailMismatchError extends TenancyError {
  constructor() {
    super(
      "INVITATION_EMAIL_MISMATCH",
      "Authenticated principal email does not match invitation",
    );
    this.name = "InvitationEmailMismatchError";
  }
}
