import { type ExecutionContext, SetMetadata } from "@nestjs/common";
import { minutes, type ThrottlerOptions } from "@nestjs/throttler";
import type { Env } from "../config/env.js";

const AUTH_ATTEMPT = "auth:attempt";

/** Marks a route (register/login) as a credential attempt so the auth throttlers apply to it. */
export const AuthAttempt = () => SetMetadata(AUTH_ATTEMPT, true);

const notAnAuthAttempt = (context: ExecutionContext): boolean =>
  !Reflect.getMetadata(AUTH_ATTEMPT, context.getHandler());

type TrackedRequest = { ip?: string; body?: { email?: unknown } };

/** Same normalisation as the request schema, so "A@x.com" and "a@x.com " share a bucket. */
function requestEmail(request: TrackedRequest): string {
  const email = request.body?.email;
  return typeof email === "string" ? email.trim().normalize("NFC").toLowerCase() : "";
}

/**
 * Three independent windows over every register/login attempt (15 minutes each):
 *  - authIp:      per client IP, whatever email is sent. A client cannot dodge it by rotating emails.
 *  - authPair:    per email + IP. Stops one client hammering one account.
 *  - authAccount: per email across all IPs. Caps distributed guessing against one account.
 *
 * Trade-off: authAccount lets a determined attacker lock a victim out of logging in for the rest of
 * the window, so it is kept well above authPair. The values are configuration, not code.
 */
export function authThrottlers(
  env: Pick<Env, "AUTH_RATE_LIMIT_IP" | "AUTH_RATE_LIMIT_ACCOUNT">,
): ThrottlerOptions[] {
  const window = minutes(15);
  return [
    { name: "authIp", ttl: window, limit: env.AUTH_RATE_LIMIT_IP, skipIf: notAnAuthAttempt },
    {
      name: "authPair",
      ttl: window,
      limit: 5,
      skipIf: notAnAuthAttempt,
      getTracker: (request: TrackedRequest) => `${requestEmail(request)}|${request.ip ?? ""}`,
    },
    {
      name: "authAccount",
      ttl: window,
      limit: env.AUTH_RATE_LIMIT_ACCOUNT,
      skipIf: notAnAuthAttempt,
      // Without an email the request fails validation anyway; fall back to the IP so that
      // email-less requests never share one global bucket.
      getTracker: (request: TrackedRequest) =>
        requestEmail(request) || `no-email|${request.ip ?? ""}`,
    },
  ];
}
