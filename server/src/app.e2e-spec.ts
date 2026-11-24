import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startTestApp, type TestApp } from "./test/http.js";

describe("application foundation", () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await startTestApp();
  });

  afterAll(async () => {
    await t.close();
  });

  it("reports health including database connectivity under /api/v1", async () => {
    const response = await fetch(`${t.baseUrl}/api/v1/health`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: { status: "ok", database: "up" } });
  });

  it.each(["/api/auth/me", "/api/v1/does-not-exist", "/nothing"])(
    "answers unknown route %s with a 404 in the shared error shape",
    async (path) => {
      const response = await fetch(`${t.baseUrl}${path}`);
      expect(response.status).toBe(404);
      expect(response.headers.get("content-type")).toContain("application/json");
      expect(await response.json()).toMatchObject({ error: { code: "NOT_FOUND" } });
    },
  );

  it("sets security headers and hides the framework", async () => {
    const response = await fetch(`${t.baseUrl}/api/v1/health`);
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("x-powered-by")).toBeNull();
    expect(response.headers.get("content-security-policy")).toBeTruthy();
  });

  describe("OpenAPI / Swagger", () => {
    it("serves the interactive docs", async () => {
      const response = await fetch(`${t.baseUrl}/api/docs`);
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("text/html");
    });

    it("documents every implemented endpoint under /api/v1", async () => {
      const response = await fetch(`${t.baseUrl}/api/docs-json`);
      expect(response.status).toBe(200);
      const document = (await response.json()) as {
        openapi: string;
        paths: Record<string, Record<string, unknown>>;
      };

      expect(document.openapi).toMatch(/^3\./);
      expect(Object.keys(document.paths).sort()).toEqual(
        [
          "/api/v1/auth/login",
          "/api/v1/auth/logout",
          "/api/v1/auth/me",
          "/api/v1/auth/register",
          "/api/v1/health",
          "/api/v1/plants",
          "/api/v1/plants/{id}",
          "/api/v1/users/me",
        ].sort(),
      );
      expect(Object.keys(document.paths["/api/v1/users/me"]!).sort()).toEqual(["get", "patch"]);
      const registerBody = JSON.stringify(document.paths["/api/v1/auth/register"]);
      expect(registerBody).toContain("password");
    });
  });

  describe("CORS allowlist", () => {
    it("allows the configured origin with credentials", async () => {
      const response = await fetch(`${t.baseUrl}/api/v1/auth/login`, {
        method: "OPTIONS",
        headers: {
          origin: "http://localhost:8443",
          "access-control-request-method": "POST",
          "access-control-request-headers": "content-type",
        },
      });
      expect(response.headers.get("access-control-allow-origin")).toBe("http://localhost:8443");
      expect(response.headers.get("access-control-allow-credentials")).toBe("true");
    });

    it("does not grant CORS to an origin outside the allowlist", async () => {
      const response = await fetch(`${t.baseUrl}/api/v1/health`, {
        headers: { origin: "https://evil.example.com" },
      });
      expect(response.headers.get("access-control-allow-origin")).toBeNull();
    });
  });

  it("blocks cross-site state-changing browser requests (CSRF)", async () => {
    const response = await fetch(`${t.baseUrl}/api/v1/auth/logout`, {
      method: "POST",
      headers: { origin: "https://evil.example.com", "sec-fetch-site": "cross-site" },
    });
    expect(response.status).toBe(403);
  });
});
