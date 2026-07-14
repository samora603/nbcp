import { Inject, Injectable } from '@nestjs/common';
import {
  ExampleAggregate,
  type ExampleId,
  type OrganizationId,
} from '../../domain/entities/example.aggregate';
import {
  EXAMPLE_REPOSITORY,
  type ExampleRepository,
} from '../../domain/repositories/example.repository';
import {
  EVENT_PUBLISHER,
  type EventPublisher,
} from '../ports/event-publisher.port';

export type CreateExampleInput = {
  organizationId: OrganizationId;
  name: string;
  /** Demo only — real modules obtain ids from an IdGenerator port. */
  id: ExampleId;
};

export type CreateExampleResult = {
  id: ExampleId;
  name: string;
  status: string;
};

/**
 * Application use case — orchestrates domain + ports.
 * No Prisma. No HTTP types. Authorization would call an RBAC port here.
 */
@Injectable()
export class CreateExampleUseCase {
  constructor(
    @Inject(EXAMPLE_REPOSITORY)
    private readonly examples: ExampleRepository,
    @Inject(EVENT_PUBLISHER)
    private readonly eventPublisher: EventPublisher,
  ) {}

  async execute(input: CreateExampleInput): Promise<CreateExampleResult> {
    // await this.rbac.authorize(...); // Phase 1+ — never skip in real modules

    const { example, events } = ExampleAggregate.create({
      id: input.id,
      organizationId: input.organizationId,
      name: input.name,
    });

    await this.examples.save(example);
    await this.eventPublisher.publish(events);

    return {
      id: example.id,
      name: example.name,
      status: example.status,
    };
  }
}
