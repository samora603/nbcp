import { Module } from '@nestjs/common';
import { CreateExampleUseCase } from './application/use-cases/create-example.use-case';
import { EXAMPLE_REPOSITORY } from './domain/repositories/example.repository';
import { EVENT_PUBLISHER } from './application/ports/event-publisher.port';
import { PrismaExampleRepository } from './infrastructure/persistence/prisma-example.repository';
import { InProcessEventPublisher } from './infrastructure/messaging/in-process-event-publisher';
import { ExampleController } from './api/controllers/example.controller';
import { ExampleForeignEventHandler } from './events/handlers/example-foreign.handler';

/**
 * NestJS composition root for this module.
 * Host apps import `ExampleModule` — peers import the facade from `./index`, not this file’s internals.
 */
@Module({
  controllers: [ExampleController],
  providers: [
    CreateExampleUseCase,
    ExampleForeignEventHandler,
    { provide: EXAMPLE_REPOSITORY, useClass: PrismaExampleRepository },
    { provide: EVENT_PUBLISHER, useClass: InProcessEventPublisher },
  ],
  exports: [CreateExampleUseCase],
})
export class ExampleModule {}
