import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiBody,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from "@nestjs/swagger";
import type { PublicUser } from "../auth/auth.service.js";
import { CurrentUser, SESSION_COOKIE, SessionAuthGuard } from "../auth/session-auth.guard.js";
import {
  errorOpenApiSchema,
  plantEnvelopeOpenApiSchema,
  plantListEnvelopeOpenApiSchema,
  toOpenApiSchema,
} from "../common/openapi.js";
import { parseBody, parseQuery } from "../common/parse-body.js";
import {
  createPlantSchema,
  listPlantsQuerySchema,
  updatePlantSchema,
} from "./plants.schemas.js";
import { PlantsService } from "./plants.service.js";

const rejectedSchema = { description: "Error", schema: errorOpenApiSchema };
const idParam = { name: "id", description: "Plant id (UUID)", schema: { type: "string", format: "uuid" } };

/**
 * Provisional initial CRUD subset. There is deliberately no DELETE: deletion semantics (PM-6) are not
 * approved yet. Ownership comes only from the session; see PlantsService.
 */
@ApiTags("plants")
@ApiCookieAuth(SESSION_COOKIE)
@ApiBearerAuth()
@UseGuards(SessionAuthGuard)
@Controller("plants")
export class PlantsController {
  constructor(private readonly plantsService: PlantsService) {}

  @Post()
  @ApiOperation({
    summary: "Add a plant owned by the authenticated user",
    description:
      "`name` is required. `species`, `location` and `notes` are optional (send `null` or omit). " +
      "Unknown or client-controlled fields (for example `userId`, `id`, `status`, timestamps) are rejected.",
  })
  @ApiBody({ schema: toOpenApiSchema(createPlantSchema) })
  @ApiCreatedResponse({ schema: plantEnvelopeOpenApiSchema })
  @ApiUnauthorizedResponse(rejectedSchema)
  @ApiUnprocessableEntityResponse(rejectedSchema)
  async create(@CurrentUser() user: PublicUser, @Body() body: unknown) {
    const plant = await this.plantsService.create(user.id, parseBody(createPlantSchema, body));
    return { data: { plant } };
  }

  @Get()
  @ApiOperation({
    summary: "List the authenticated user's plants",
    description: "Newest first (`createdAt` descending, then `id`). Only the caller's plants are returned.",
  })
  @ApiQuery({ name: "limit", required: false, schema: { type: "integer", minimum: 1, maximum: 100, default: 50 } })
  @ApiQuery({ name: "offset", required: false, schema: { type: "integer", minimum: 0, default: 0 } })
  @ApiOkResponse({ schema: plantListEnvelopeOpenApiSchema })
  @ApiUnauthorizedResponse(rejectedSchema)
  @ApiUnprocessableEntityResponse(rejectedSchema)
  async list(@CurrentUser() user: PublicUser, @Query() query: unknown) {
    const { plants, meta } = await this.plantsService.list(user.id, parseQuery(listPlantsQuerySchema, query));
    return { data: { plants }, meta };
  }

  @Get(":id")
  @ApiOperation({ summary: "View one of the authenticated user's plants" })
  @ApiParam(idParam)
  @ApiOkResponse({ schema: plantEnvelopeOpenApiSchema })
  @ApiUnauthorizedResponse(rejectedSchema)
  @ApiNotFoundResponse({
    description: "Not found. The same answer is given for a missing plant, someone else's plant, and an invalid id.",
    schema: errorOpenApiSchema,
  })
  async detail(@CurrentUser() user: PublicUser, @Param("id") id: string) {
    return { data: { plant: await this.plantsService.get(user.id, id) } };
  }

  @Patch(":id")
  @ApiOperation({
    summary: "Update one of the authenticated user's plants",
    description:
      "Partial update; at least one field is required. Send `null` to clear `species`, `location` or `notes`. " +
      "`name` cannot be cleared.",
  })
  @ApiParam(idParam)
  @ApiBody({ schema: toOpenApiSchema(updatePlantSchema) })
  @ApiOkResponse({ schema: plantEnvelopeOpenApiSchema })
  @ApiUnauthorizedResponse(rejectedSchema)
  @ApiNotFoundResponse({
    description: "Not found. The same answer is given for a missing plant, someone else's plant, and an invalid id.",
    schema: errorOpenApiSchema,
  })
  @ApiUnprocessableEntityResponse(rejectedSchema)
  async update(@CurrentUser() user: PublicUser, @Param("id") id: string, @Body() body: unknown) {
    const plant = await this.plantsService.update(user.id, id, parseBody(updatePlantSchema, body));
    return { data: { plant } };
  }
}
