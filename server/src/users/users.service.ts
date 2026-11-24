import { Injectable, NotFoundException } from "@nestjs/common";
import { publicUserSelect, type PublicUser } from "../auth/auth.service.js";
import { Prisma } from "../generated/prisma/client.js";
import { PrismaService } from "../prisma/prisma.service.js";
import type { UpdateProfileInput } from "./users.schemas.js";

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async updateProfile(userId: string, input: UpdateProfileInput): Promise<PublicUser> {
    try {
      return await this.prisma.user.update({
        where: { id: userId },
        data: { name: input.name },
        select: publicUserSelect,
      });
    } catch (error) {
      // The session outlived the account (e.g. deleted concurrently).
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
        throw new NotFoundException("User not found");
      }
      throw error;
    }
  }
}
