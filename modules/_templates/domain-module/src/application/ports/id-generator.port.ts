/**
 * Optional ports used by use cases (ids, clock, rbac). Placeholder stubs for the template.
 */
export interface IdGenerator {
  generate(): string;
}

export const ID_GENERATOR = Symbol('ID_GENERATOR');
