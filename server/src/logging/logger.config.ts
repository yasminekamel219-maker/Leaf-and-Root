import type { IncomingMessage, ServerResponse } from "node:http";
import type { Options } from "pino-http";
import type { Env } from "../config/env.js";

/**
 * Defence in depth: the request/response serializers below already drop headers and bodies,
 * but redaction guarantees credentials never reach a log line even if a serializer changes
 * or a developer logs an object by hand.
 */
export const REDACTED_PATHS = [
  "req.headers.authorization",
  "req.headers.cookie",
  'res.headers["set-cookie"]',
  "req.body.password",
  // Root-level keys: a "*." wildcard only matches one level below the root.
  "password",
  "passwordHash",
  "token",
  "tokenHash",
  "authorization",
  "cookie",
  "*.password",
  "*.passwordHash",
  "*.token",
  "*.tokenHash",
  "*.authorization",
  "*.cookie",
];

export function createPinoHttpOptions(env: Pick<Env, "LOG_LEVEL" | "NODE_ENV">): Options {
  return {
    level: env.NODE_ENV === "test" && env.LOG_LEVEL === "info" ? "silent" : env.LOG_LEVEL,
    redact: { paths: REDACTED_PATHS, censor: "[REDACTED]" },
    serializers: {
      // Method + path only: no headers, no body, and the query string is dropped
      // because it can carry tokens in some clients.
      req: (req: IncomingMessage & { id?: unknown }) => ({
        id: req.id,
        method: req.method,
        url: req.url?.split("?", 1)[0],
      }),
      res: (res: ServerResponse) => ({ statusCode: res.statusCode }),
    },
    customLogLevel: (_req, res, error) =>
      error || res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info",
    autoLogging: { ignore: (req) => req.url?.endsWith("/health") ?? false },
  };
}
