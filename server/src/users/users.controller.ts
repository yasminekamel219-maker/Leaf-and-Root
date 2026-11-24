import { Body, Controller, Get, Patch, UseGuards } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiBody,
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from "@nestjs/swagger";
import type { PublicUser } from "../auth/auth.service.js";
import { CurrentUser, SESSION_COOKIE, SessionAuthGuard } from "../auth/session-auth.guard.js";
import { parseBody } from "../common/parse-body.js";
import {
  errorOpenApiSchema,
  toOpenApiSchema,
  userEnvelopeOpenApiSchema,
} from "../common/openapi.js";
import { updateProfileSchema } from "./users.schemas.js";
import { UsersService } from "./users.service.js";

const rejectedSchema = { description: "Error", schema: errorOpenApiSchema };

@ApiTags("users")
@ApiCookieAuth(SESSION_COOKIE)
@ApiBearerAuth()
@UseGuards(SessionAuthGuard)
@Controller("users")
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get("me")
  @ApiOperation({ summary: "View the authenticated user's profile" })
  @ApiOkResponse({ schema: userEnvelopeOpenApiSchema })
  @ApiUnauthorizedResponse(rejectedSchema)
  me(@CurrentUser() user: PublicUser) {
    return { data: { user } };
  }

  @Patch("me")
  @ApiOperation({
    summary: "Update the authenticated user's profile",
    description: "Only `name` is editable. Any other field (including `email` and `role`) is rejected.",
  })
  @ApiBody({ schema: toOpenApiSchema(updateProfileSchema) })
  @ApiOkResponse({ schema: userEnvelopeOpenApiSchema })
  @ApiUnauthorizedResponse(rejectedSchema)
  @ApiUnprocessableEntityResponse(rejectedSchema)
  async update(@CurrentUser() user: PublicUser, @Body() body: unknown) {
    return {
      data: { user: await this.usersService.updateProfile(user.id, parseBody(updateProfileSchema, body)) },
    };
  }
}
