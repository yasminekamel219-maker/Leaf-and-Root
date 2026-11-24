import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
  createParamDecorator,
} from "@nestjs/common";
import type { Request } from "express";
import { AuthService, type PublicUser } from "./auth.service.js";

export const SESSION_COOKIE = "leaf_root_session";

export type AuthenticatedRequest = Request & { auth: { user: PublicUser; token: string } };

/** Bearer header wins over the cookie so native clients are never confused by stale cookies. */
export function extractSessionToken(request: Pick<Request, "headers">): string | undefined {
  const authorization = request.headers.authorization;
  if (authorization) {
    const [scheme, value] = authorization.split(" ");
    if (scheme?.toLowerCase() === "bearer" && value) return value;
    return undefined;
  }
  const cookieHeader = request.headers.cookie;
  if (!cookieHeader) return undefined;
  for (const part of cookieHeader.split(";")) {
    const index = part.indexOf("=");
    if (index > 0 && part.slice(0, index).trim() === SESSION_COOKIE) {
      try {
        return decodeURIComponent(part.slice(index + 1).trim());
      } catch {
        // A malformed cookie is simply "no credentials" (401 / no-op logout), never a 500.
        return undefined;
      }
    }
  }
  return undefined;
}

@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = extractSessionToken(request);
    if (!token) throw new UnauthorizedException();
    request.auth = { user: await this.authService.getUser(token), token };
    return true;
  }
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): PublicUser =>
    context.switchToHttp().getRequest<AuthenticatedRequest>().auth.user,
);
