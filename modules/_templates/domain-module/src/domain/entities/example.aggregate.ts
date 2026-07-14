/**
 * Demo aggregate — pure domain (no NestJS, no Prisma).
 * Replace with a real aggregate from the domain map when copying this template.
 */

import { ExampleCreatedEvent } from '../events/example-created.event';

export type ExampleId = string & { readonly brand: 'ExampleId' };
export type OrganizationId = string & { readonly brand: 'OrganizationId' };

export type ExampleStatus = 'draft' | 'active' | 'archived';

export class ExampleAggregate {
  private constructor(
    readonly id: ExampleId,
    readonly organizationId: OrganizationId,
    private _name: string,
    private _status: ExampleStatus,
  ) {}

  static create(params: {
    id: ExampleId;
    organizationId: OrganizationId;
    name: string;
  }): { example: ExampleAggregate; events: ExampleCreatedEvent[] } {
    const name = params.name.trim();
    if (!name) {
      throw new Error('Example name is required');
    }

    const example = new ExampleAggregate(
      params.id,
      params.organizationId,
      name,
      'draft',
    );

    return {
      example,
      events: [
        new ExampleCreatedEvent({
          exampleId: example.id,
          organizationId: example.organizationId,
          name: example.name,
          occurredAt: new Date(),
        }),
      ],
    };
  }

  /** Rehydrate from persistence — no events. */
  static rehydrate(params: {
    id: ExampleId;
    organizationId: OrganizationId;
    name: string;
    status: ExampleStatus;
  }): ExampleAggregate {
    return new ExampleAggregate(
      params.id,
      params.organizationId,
      params.name,
      params.status,
    );
  }

  get name(): string {
    return this._name;
  }

  get status(): ExampleStatus {
    return this._status;
  }

  activate(): void {
    if (this._status === 'archived') {
      throw new Error('Cannot activate an archived example');
    }
    this._status = 'active';
  }
}
