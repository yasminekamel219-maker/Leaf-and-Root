import type { INestApplication } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { createApp } from "../create-app.js";
import { PrismaService } from "../prisma/prisma.service.js";

export const PASSWORD = "correct horse battery staple";

export type TestApp = {
  app: INestApplication;
  baseUrl: string;
  prisma: PrismaService;
  close: () => Promise<void>;
};

export async function startTestApp(): Promise<TestApp> {
  const app = await createApp();
  await app.listen(0, "127.0.0.1");
  return {
    app,
    baseUrl: await app.getUrl(),
    prisma: app.get(PrismaService),
    close: () => app.close(),
  };
}

export function uniqueEmail(prefix = "user"): string {
  return `${prefix}-${randomUUID()}@example.com`;
}

export function jsonRequest(
  baseUrl: string,
  path: string,
  options: { method?: string; body?: unknown; headers?: Record<string, string> } = {},
): Promise<Response> {
  return fetch(`${baseUrl}${path}`, {
    method: options.method ?? (options.body === undefined ? "GET" : "POST"),
    headers: {
      ...(options.body === undefined ? {} : { "content-type": "application/json" }),
      ...options.headers,
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
}

export function sessionCookie(response: Response): string {
  const cookie = response.headers.get("set-cookie")?.split(";", 1)[0];
  if (!cookie?.startsWith("leaf_root_session=")) throw new Error("No session cookie in response");
  return cookie;
}

/** Registers a fresh user through the real API and returns its credentials and session cookie. */
export async function registerUser(baseUrl: string, name = "Test Grower") {
  const email = uniqueEmail();
  const response = await jsonRequest(baseUrl, "/api/v1/auth/register", {
    body: { email, password: PASSWORD, name },
  });
  if (response.status !== 201) throw new Error(`register failed: ${response.status}`);
  const body = (await response.json()) as { data: { user: { id: string } } };
  return { email, name, id: body.data.user.id, cookie: sessionCookie(response) };
}
