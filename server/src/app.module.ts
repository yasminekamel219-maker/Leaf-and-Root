import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { minutes, ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { LoggerModule } from "nestjs-pino";
import { AuthModule } from "./auth/auth.module.js";
import { authThrottlers } from "./auth/auth-rate-limit.js";
import { getEnv } from "./config/env.js";
import { HealthController } from "./health.controller.js";
import { createPinoHttpOptions } from "./logging/logger.config.js";
import { PlantsModule } from "./plants/plants.module.js";
import { PrismaModule } from "./prisma/prisma.module.js";
import { UsersModule } from "./users/users.module.js";

@Module({
  imports: [
    LoggerModule.forRootAsync({
      useFactory: () => ({ pinoHttp: createPinoHttpOptions(getEnv()) }),
    }),
    // Read at app creation (not import time) so configuration and tests can change the limits.
    ThrottlerModule.forRootAsync({
      useFactory: () => [{ ttl: minutes(1), limit: 100 }, ...authThrottlers(getEnv())],
    }),
    PrismaModule,
    AuthModule,
    UsersModule,
    PlantsModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
