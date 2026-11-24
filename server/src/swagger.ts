import type { INestApplication } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { SESSION_COOKIE } from "./auth/session-auth.guard.js";

export const SWAGGER_PATH = "api/docs";

export function setupSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle("Leaf & Root API")
    .setDescription(
      "REST API for the Leaf & Root web and mobile clients. Session-based authentication: " +
        "browsers use an HTTP-only cookie; native clients send `X-Auth-Transport: bearer` and " +
        "then `Authorization: Bearer <token>`.",
    )
    .setVersion("1.0")
    .addCookieAuth(SESSION_COOKIE)
    .addBearerAuth()
    .build();

  SwaggerModule.setup(SWAGGER_PATH, app, SwaggerModule.createDocument(app, config), {
    jsonDocumentUrl: `${SWAGGER_PATH}-json`,
  });
}
