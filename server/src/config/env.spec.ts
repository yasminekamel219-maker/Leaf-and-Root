import { describe, expect, it } from "vitest";
import { loadEnv } from "./env.js";

const base = { DATABASE_URL: "postgresql://user:pw@localhost:5432/db" };

describe("loadEnv", () => {
  it("applies safe defaults", () => {
    const env = loadEnv(base);
    expect(env).toMatchObject({
      NODE_ENV: "development",
      API_PORT: 3001,
      SESSION_TTL_DAYS: 30,
      CORS_ALLOWED_ORIGINS: [],
      SWAGGER_ENABLED: true,
    });
  });

  it("disables Swagger by default in production but allows opting in", () => {
    expect(loadEnv({ ...base, NODE_ENV: "production" }).SWAGGER_ENABLED).toBe(false);
    expect(
      loadEnv({ ...base, NODE_ENV: "production", SWAGGER_ENABLED: "true" }).SWAGGER_ENABLED,
    ).toBe(true);
  });

  it("parses the CORS allowlist", () => {
    const env = loadEnv({
      ...base,
      CORS_ALLOWED_ORIGINS: "http://localhost:8443, https://app.example.com",
    });
    expect(env.CORS_ALLOWED_ORIGINS).toEqual(["http://localhost:8443", "https://app.example.com"]);
  });

  it("rejects wildcard and path-bearing origins", () => {
    expect(() => loadEnv({ ...base, CORS_ALLOWED_ORIGINS: "*" })).toThrow(/CORS_ALLOWED_ORIGINS/);
    expect(() => loadEnv({ ...base, CORS_ALLOWED_ORIGINS: "https://a.example.com/" })).toThrow();
  });

  it("requires a PostgreSQL DATABASE_URL and never echoes its value", () => {
    expect(() => loadEnv({})).toThrow(/DATABASE_URL/);
    try {
      loadEnv({ DATABASE_URL: "mysql://secret-user:secret-pass@host/db" });
      expect.unreachable();
    } catch (error) {
      expect((error as Error).message).not.toContain("secret-pass");
    }
  });
});
