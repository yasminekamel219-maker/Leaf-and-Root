import { ConflictException, Injectable, UnauthorizedException } from "@nestjs/common";
import { getEnv } from "../config/env.js";
import { Prisma } from "../generated/prisma/client.js";
import { PrismaService } from "../prisma/prisma.service.js";
import type { LoginInput, RegisterInput } from "./auth.schemas.js";
import { hashPassword, needsRehash, verifyPassword } from "./password.js";
import { createSessionToken, hashSessionToken } from "./session-token.js";

const dummyPasswordHash = hashPassword("dummy password used only to equalize login work");

/** Fields that may ever leave the API. `role` and `passwordHash` are intentionally absent. */
export const publicUserSelect = {
  id: true,
  email: true,
  name: true,
  createdAt: true,
  updatedAt: true,
} as const;

export type PublicUser = {
  id: string;
  email: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
};

function sessionExpiry(): Date {
  return new Date(Date.now() + getEnv().SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
}

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  async register(input: RegisterInput) {
    const token = createSessionToken();
    const expiresAt = sessionExpiry();

    try {
      const user = await this.prisma.user.create({
        data: {
          email: input.email,
          name: input.name,
          passwordHash: await hashPassword(input.password),
          sessions: {
            create: { tokenHash: hashSessionToken(token), expiresAt },
          },
        },
        select: publicUserSelect,
      });
      return { user, token, expiresAt };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException({
          code: "EMAIL_IN_USE",
          message: "An account already exists for this email",
        });
      }
      throw error;
    }
  }

  async login(input: LoginInput) {
    const record = await this.prisma.user.findUnique({
      where: { email: input.email },
      select: { ...publicUserSelect, passwordHash: true },
    });
    const isValid = await verifyPassword(
      input.password,
      record?.passwordHash ?? (await dummyPasswordHash),
    );
    if (record && !isValid && needsRehash(record.passwordHash)) {
      // A wrong password on a legacy (cheaper) hash would otherwise answer much faster than an
      // unknown email, which is checked against a current-cost dummy. Pad to equal work.
      await verifyPassword(input.password, await dummyPasswordHash);
    }
    if (!record || !isValid) throw new UnauthorizedException("Invalid email or password");

    // Transparently upgrade hashes created with weaker scrypt parameters. The password was just
    // verified, so this is the only moment the plaintext is available to re-hash.
    if (needsRehash(record.passwordHash)) {
      await this.prisma.user.update({
        where: { id: record.id },
        data: { passwordHash: await hashPassword(input.password) },
        select: { id: true },
      });
    }

    const token = createSessionToken();
    // Opportunistic cleanup keeps the Session table bounded without a scheduler.
    await this.prisma.session.deleteMany({
      where: { userId: record.id, expiresAt: { lte: new Date() } },
    });
    const expiresAt = sessionExpiry();
    await this.prisma.session.create({
      data: { tokenHash: hashSessionToken(token), userId: record.id, expiresAt },
    });
    const { passwordHash: _, ...user } = record;
    return { user, token, expiresAt };
  }

  async getUser(token: string | undefined): Promise<PublicUser> {
    if (!token) throw new UnauthorizedException();
    const session = await this.prisma.session.findFirst({
      where: { tokenHash: hashSessionToken(token), expiresAt: { gt: new Date() } },
      select: { user: { select: publicUserSelect } },
    });
    if (!session) throw new UnauthorizedException();
    return session.user;
  }

  async logout(token: string | undefined): Promise<void> {
    if (!token) return;
    await this.prisma.session.deleteMany({ where: { tokenHash: hashSessionToken(token) } });
  }
}
