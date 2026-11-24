import "reflect-metadata";
import "dotenv/config";
import type { INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { Request, Response } from "express";
import { Logger } from "nestjs-pino";
import { AppModule } from "./app.module.js";
import { ApiExceptionFilter } from "./common/api-exception.filter.js";
import { getEnv } from "./config/env.js";
import { setupSwagger } from "./swagger.js";

export const API_PREFIX = "api/v1";

export async function createApp(): Promise<INestApplication> {
  // Validate configuration before anything else so misconfiguration fails fast with a clear message.
  const env = getEnv();

  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.setGlobalPrefix(API_PREFIX);

  app.useSecurityHeaders(
    // Swagger UI needs inline scripts/styles; it is off by default in production.
    env.SWAGGER_ENABLED
      ? {
          contentSecurityPolicy: {
            directives: {
              "default-src": ["'self'"],
              "script-src": ["'self'", "'unsafe-inline'"],
              "style-src": ["'self'", "'unsafe-inline'"],
              "img-src": ["'self'", "data:"],
            },
          },
        }
      : undefined,
  );
  // Fetch-Metadata CSRF defence. Browser origins on the CORS allowlist are trusted for writes.
  app.enableCsrfProtection({ trustedOrigins: env.CORS_ALLOWED_ORIGINS });

  if (env.CORS_ALLOWED_ORIGINS.length > 0) {
    app.enableCors({
      origin: env.CORS_ALLOWED_ORIGINS,
      credentials: true,
      methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization", "X-Auth-Transport"],
      maxAge: 600,
    });
  }

  app.useGlobalFilters(new ApiExceptionFilter());
  if (env.SWAGGER_ENABLED) setupSwagger(app);
  app.enableShutdownHooks();

  // Nest only mounts its not-found handler under the global prefix, so paths outside `/api/v1`
  // would otherwise get Express's default HTML 404. Register this last, after routes exist.
  await app.init();
  app
    .getHttpAdapter()
    .getInstance()
    .use((request: Request, response: Response) => {
      response.status(404).json({
        error: { code: "NOT_FOUND", message: `Cannot ${request.method} ${request.path}` },
      });
    });
  return app;
}
