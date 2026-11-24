import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import { HttpAdapterHost } from "@nestjs/core";
import {
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiHeader,
  type ApiHeaderOptions,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from "@nestjs/swagger";
import type { Request } from "express";
import { getEnv } from "../config/env.js";
import { parseBody } from "../common/parse-body.js";
import {
  bearerEnvelopeOpenApiSchema,
  errorOpenApiSchema,
  type OpenApiSchema,
  toOpenApiSchema,
  userEnvelopeOpenApiSchema,
} from "../common/openapi.js";
import { loginSchema, registerSchema } from "./auth.schemas.js";
import { AuthAttempt } from "./auth-rate-limit.js";
import { AuthService, type PublicUser } from "./auth.service.js";
import {
  CurrentUser,
  extractSessionToken,
  SESSION_COOKIE,
  SessionAuthGuard,
} from "./session-auth.guard.js";

const transportHeader: ApiHeaderOptions = {
  name: "X-Auth-Transport",
  required: false,
  description:
    "Send `bearer` (native/mobile clients) to receive the session token in the response body " +
    "instead of an HTTP-only cookie. Browsers should omit it.",
  schema: { type: "string", enum: ["bearer"] },
};

const rejectedSchema = { description: "Error", schema: errorOpenApiSchema };
const successSchema: OpenApiSchema = {
  oneOf: [userEnvelopeOpenApiSchema, bearerEnvelopeOpenApiSchema],
};

type SessionResult = { user: PublicUser; token: string; expiresAt: Date };

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(
    private readonly adapterHost: HttpAdapterHost,
    private readonly authService: AuthService,
  ) {}

  @Post("register")
  @AuthAttempt()
  @ApiOperation({ summary: "Create an account and start a session" })
  @ApiHeader(transportHeader)
  @ApiBody({ schema: toOpenApiSchema(registerSchema) })
  @ApiCreatedResponse({ schema: successSchema })
  @ApiConflictResponse(rejectedSchema)
  @ApiUnprocessableEntityResponse(rejectedSchema)
  @ApiResponse({ status: 429, ...rejectedSchema })
  async register(
    @Body() body: unknown,
    @Headers("x-auth-transport") transport: string | undefined,
    @Res({ passthrough: true }) response: unknown,
  ) {
    const result = await this.authService.register(parseBody(registerSchema, body));
    return this.sessionResponse(result, transport, response);
  }

  @Post("login")
  @HttpCode(HttpStatus.OK)
  @AuthAttempt()
  @ApiOperation({ summary: "Verify credentials and start a session" })
  @ApiHeader(transportHeader)
  @ApiBody({ schema: toOpenApiSchema(loginSchema) })
  @ApiOkResponse({ schema: successSchema })
  @ApiUnauthorizedResponse(rejectedSchema)
  @ApiUnprocessableEntityResponse(rejectedSchema)
  @ApiResponse({ status: 429, ...rejectedSchema })
  async login(
    @Body() body: unknown,
    @Headers("x-auth-transport") transport: string | undefined,
    @Res({ passthrough: true }) response: unknown,
  ) {
    const result = await this.authService.login(parseBody(loginSchema, body));
    return this.sessionResponse(result, transport, response);
  }

  @Get("me")
  @UseGuards(SessionAuthGuard)
  @ApiOperation({ summary: "Return the authenticated user" })
  @ApiCookieAuth(SESSION_COOKIE)
  @ApiBearerAuth()
  @ApiOkResponse({ schema: userEnvelopeOpenApiSchema })
  @ApiUnauthorizedResponse(rejectedSchema)
  me(@CurrentUser() user: PublicUser) {
    return { data: { user } };
  }

  @Post("logout")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: "End the current session",
    description:
      "Deletes the server-side session so the token stops working immediately. Idempotent: " +
      "always 204, even when no valid session was supplied.",
  })
  @ApiCookieAuth(SESSION_COOKIE)
  @ApiBearerAuth()
  @ApiNoContentResponse({ description: "Session ended" })
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: unknown,
  ): Promise<void> {
    await this.authService.logout(extractSessionToken(request));
    this.adapterHost.httpAdapter.clearCookie(response, SESSION_COOKIE, { path: "/" });
  }

  private sessionResponse(
    { user, token, expiresAt }: SessionResult,
    transport: string | undefined,
    response: unknown,
  ) {
    if (transport?.toLowerCase() === "bearer") {
      return { data: { user, token, expiresAt } };
    }
    this.adapterHost.httpAdapter.setCookie(response, SESSION_COOKIE, token, {
      httpOnly: true,
      secure: getEnv().NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      expires: expiresAt,
    });
    return { data: { user } };
  }
}
