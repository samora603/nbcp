import type { ExampleId, OrganizationId } from '../entities/example.aggregate';

/**
 * Domain event — past tense. Part of this module's public language when re-exported.
 */
export class ExampleCreatedEvent {
  readonly type = 'example.created' as const;
  readonly version = 1 as const;

  constructor(
    readonly payload: {
      exampleId: ExampleId;
      organizationId: OrganizationId;
      name: string;
      occurredAt: Date;
    },
  ) {}
}
