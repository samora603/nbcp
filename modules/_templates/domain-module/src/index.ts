/**
 * PUBLIC FACADE — the only import path other modules may use.
 *
 * Export use-case types, event contracts, and Nest registration — never Prisma
 * repositories or controllers for peer consumption.
 */
export { ExampleModule } from './example.module';
export { CreateExampleUseCase } from './application/use-cases/create-example.use-case';
export type { CreateExampleInput, CreateExampleResult } from './application/use-cases/create-example.use-case';
export { ExampleCreatedEvent } from './domain/events/example-created.event';
export type { ExampleId, OrganizationId } from './domain/entities/example.aggregate';
