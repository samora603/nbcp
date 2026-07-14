import type { ExampleAggregate, ExampleId, OrganizationId } from '../entities/example.aggregate';

/**
 * Repository PORT — defined in domain, implemented in infrastructure.
 * Other modules must NEVER depend on this symbol; they use the public facade.
 */
export interface ExampleRepository {
  save(example: ExampleAggregate): Promise<void>;
  findById(params: {
    organizationId: OrganizationId;
    id: ExampleId;
  }): Promise<ExampleAggregate | null>;
}

export const EXAMPLE_REPOSITORY = Symbol('EXAMPLE_REPOSITORY');
