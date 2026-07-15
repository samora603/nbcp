export class InventoryError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "InventoryError";
    this.code = code;
  }
}

export class ConflictError extends InventoryError {
  constructor(message: string) {
    super("CONFLICT", message);
    this.name = "ConflictError";
  }
}

export class NotFoundError extends InventoryError {
  constructor(message: string) {
    super("NOT_FOUND", message);
    this.name = "NotFoundError";
  }
}

export class ValidationError extends InventoryError {
  constructor(message: string) {
    super("VALIDATION", message);
    this.name = "ValidationError";
  }
}

export class AuthorizationError extends InventoryError {
  constructor(message: string) {
    super("FORBIDDEN", message);
    this.name = "AuthorizationError";
  }
}

export class InsufficientStockError extends InventoryError {
  constructor(message: string) {
    super("INSUFFICIENT_STOCK", message);
    this.name = "InsufficientStockError";
  }
}

export class ImmutableMovementError extends InventoryError {
  constructor(message: string) {
    super("IMMUTABLE", message);
    this.name = "ImmutableMovementError";
  }
}
