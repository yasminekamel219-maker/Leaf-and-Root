import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "../generated/prisma/client.js";
import { PrismaService } from "../prisma/prisma.service.js";
import {
  type CreatePlantInput,
  type ListPlantsQuery,
  plantIdSchema,
  type UpdatePlantInput,
} from "./plants.schemas.js";

/** Fields that may leave the API. `userId` is intentionally absent. */
export const publicPlantSelect = {
  id: true,
  name: true,
  species: true,
  location: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
} as const;

/**
 * Every query is scoped by `userId` inside the database call itself, so a plant that is missing and a
 * plant that belongs to someone else are indistinguishable (both are "not found"). There is no role
 * bypass.
 */
@Injectable()
export class PlantsService {
  constructor(private readonly prisma: PrismaService) {}

  create(userId: string, input: CreatePlantInput) {
    return this.prisma.plant.create({ data: { ...input, userId }, select: publicPlantSelect });
  }

  async list(userId: string, { limit, offset }: ListPlantsQuery) {
    const [plants, total] = await this.prisma.$transaction([
      this.prisma.plant.findMany({
        where: { userId },
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        skip: offset,
        take: limit,
        select: publicPlantSelect,
      }),
      this.prisma.plant.count({ where: { userId } }),
    ]);
    return { plants, meta: { total, limit, offset } };
  }

  async get(userId: string, id: string) {
    const plant = await this.prisma.plant.findFirst({
      where: { id: this.validId(id), userId },
      select: publicPlantSelect,
    });
    if (!plant) throw this.notFound();
    return plant;
  }

  async update(userId: string, id: string, input: UpdatePlantInput) {
    try {
      return await this.prisma.plant.update({
        where: { id: this.validId(id), userId },
        data: input,
        select: publicPlantSelect,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
        throw this.notFound();
      }
      throw error;
    }
  }

  /** A malformed id can never match a row, so it gets the same answer as a missing plant. */
  private validId(id: string): string {
    if (!plantIdSchema.safeParse(id).success) throw this.notFound();
    return id;
  }

  private notFound(): NotFoundException {
    return new NotFoundException("Plant not found");
  }
}
