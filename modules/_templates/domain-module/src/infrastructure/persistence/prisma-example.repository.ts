import { Injectable } from '@nestjs/common';
import type {
  ExampleAggregate,
  ExampleId,
  ExampleStatus,
  OrganizationId,
} from '../../domain/entities/example.aggregate';
import { ExampleAggregate as Example } from '../../domain/entities/example.aggregate';
import type { ExampleRepository } from '../../domain/repositories/example.repository';

/**
 * Shape Prisma would return for `example_*` tables.
 * Real modules inject PrismaClient — this stub keeps the template free of a live schema.
 */
type ExampleRow = {
  id: string;
  organizationId: string;
  name: string;
  status: ExampleStatus;
};

/**
 * Prisma-backed repository STUB.
 *
 * Forbidden patterns this adapter exists to prevent:
 * - Other modules importing this class
 * - Writing rows owned by another module
 */
@Injectable()
export class PrismaExampleRepository implements ExampleRepository {
  // constructor(private readonly prisma: PrismaClient) {}

  /** In-memory stand-in until Prisma schema exists for a real module. */
  private readonly rows = new Map<string, ExampleRow>();

  async save(example: ExampleAggregate): Promise<void> {
    const key = `${example.organizationId}:${example.id}`;
    this.rows.set(key, {
      id: example.id,
      organizationId: example.organizationId,
      name: example.name,
      status: example.status,
    });
    // await this.prisma.exampleRecord.upsert({ ... mapped fields ... });
  }

  async findById(params: {
    organizationId: OrganizationId;
    id: ExampleId;
  }): Promise<ExampleAggregate | null> {
    const key = `${params.organizationId}:${params.id}`;
    const row = this.rows.get(key);
    if (!row) {
      return null;
    }

    // Tenant predicate is mandatory — never query by id alone in real code.
    return Example.rehydrate({
      id: row.id as ExampleId,
      organizationId: row.organizationId as OrganizationId,
      name: row.name,
      status: row.status,
    });
  }
}
