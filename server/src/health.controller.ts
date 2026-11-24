import { Controller, Get, ServiceUnavailableException } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { SkipThrottle } from "@nestjs/throttler";
import { errorOpenApiSchema } from "./common/openapi.js";
import { PrismaService } from "./prisma/prisma.service.js";

@ApiTags("health")
@SkipThrottle()
@Controller("health")
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: "Liveness and database readiness" })
  @ApiOkResponse({
    schema: {
      type: "object",
      properties: {
        data: {
          type: "object",
          properties: {
            status: { type: "string", example: "ok" },
            database: { type: "string", example: "up" },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 503, description: "Database unreachable", schema: errorOpenApiSchema })
  async health() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new ServiceUnavailableException({
        code: "DATABASE_UNAVAILABLE",
        message: "Database is not reachable",
      });
    }
    return { data: { status: "ok", database: "up" } };
  }
}
