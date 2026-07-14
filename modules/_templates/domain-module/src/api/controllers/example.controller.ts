import { Body, Controller, Post, Headers } from '@nestjs/common';
import { CreateExampleUseCase } from '../../application/use-cases/create-example.use-case';
import type {
  ExampleId,
  OrganizationId,
} from '../../domain/entities/example.aggregate';
import { CreateExampleHttpBody } from '../http/create-example.http-dto';

/**
 * Thin NestJS controller — no Prisma, no domain invariants beyond mapping.
 *
 * AuthN/AuthZ guards would bind here in real modules; authorization still
 * re-checked in the use case via an RBAC port.
 */
@Controller('examples')
export class ExampleController {
  constructor(private readonly createExample: CreateExampleUseCase) {}

  @Post()
  async create(
    @Body() body: CreateExampleHttpBody,
    @Headers('x-organization-id') organizationIdHeader: string,
    @Headers('x-demo-example-id') demoIdHeader: string,
  ) {
    // Demo headers only — real apps resolve org + ids from auth context / IdGenerator.
    const result = await this.createExample.execute({
      organizationId: organizationIdHeader as OrganizationId,
      id: demoIdHeader as ExampleId,
      name: body.name,
    });

    return {
      data: result,
    };
  }
}
