import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { PlantsController } from "./plants.controller.js";
import { PlantsService } from "./plants.service.js";

@Module({
  imports: [AuthModule],
  controllers: [PlantsController],
  providers: [PlantsService],
})
export class PlantsModule {}
