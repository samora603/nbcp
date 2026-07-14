/**
 * Placeholder domain error shape. Prefer a shared @nbcp/errors package when available.
 */
export class ExampleDomainError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = 'ExampleDomainError';
  }
}
