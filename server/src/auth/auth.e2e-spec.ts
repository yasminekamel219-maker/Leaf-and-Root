import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { verifyPassword } from "./password.js";
import {
  jsonRequest,
  PASSWORD,
  registerUser,
  sessionCookie,
  startTestApp,
  type TestApp,
  uniqueEmail,
} from "../test/http.js";

describe("authentication API (/api/v1/auth)", () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await startTestApp();
  });

  afterAll(async () => {
    await t.close();
  });

  describe("register", () => {
    it("creates a persisted user with a hashed password and a hashed session token", async () => {
      const email = uniqueEmail("New.Grower").toUpperCase();
      const response = await jsonRequest(t.baseUrl, "/api/v1/auth/register", {
        body: { email, password: PASSWORD, name: "  New Grower  " },
      });

      expect(response.status).toBe(201);
      const body = (await response.json()) as { data: { user: Record<string, unknown> } };
      expect(body.data.user).toMatchObject({ email: email.toLowerCase(), name: "New Grower" });
      expect(Object.keys(body.data.user).sort()).toEqual(
        ["createdAt", "email", "id", "name", "updatedAt"].sort(),
      );
      expect(JSON.stringify(body)).not.toMatch(/password|role|scrypt/i);

      const cookieHeader = response.headers.get("set-cookie") ?? "";
      expect(cookieHeader).toMatch(/HttpOnly/i);
      expect(cookieHeader).toMatch(/SameSite=Lax/i);
      const token = sessionCookie(response).split("=")[1]!;

      // Database persistence, checked directly rather than through the API.
      const row = await t.prisma.user.findUnique({ where: { email: email.toLowerCase() } });
      expect(row).not.toBeNull();
      expect(row!.id).toBe(body.data.user.id);
      expect(row!.role).toBe("USER");
      expect(row!.passwordHash).not.toContain(PASSWORD);
      expect(row!.passwordHash.startsWith("scrypt$")).toBe(true);
      expect(await verifyPassword(PASSWORD, row!.passwordHash)).toBe(true);

      const session = await t.prisma.session.findFirst({ where: { userId: row!.id } });
      expect(session).not.toBeNull();
      expect(session!.tokenHash).toBe(createHash("sha256").update(token).digest("hex"));
      expect(session!.tokenHash).not.toBe(token);
      expect(session!.expiresAt.getTime()).toBeGreaterThan(Date.now());
    });

    it("rejects a duplicate email, case-insensitively, without creating a second row", async () => {
      const email = uniqueEmail("dupe");
      const first = await jsonRequest(t.baseUrl, "/api/v1/auth/register", {
        body: { email, password: PASSWORD, name: "First Owner" },
      });
      expect(first.status).toBe(201);

      for (const attempt of [email, email.toUpperCase()]) {
        const second = await jsonRequest(t.baseUrl, "/api/v1/auth/register", {
          body: { email: attempt, password: "another long password", name: "Impostor" },
        });
        expect(second.status).toBe(409);
        expect(await second.json()).toMatchObject({ error: { code: "EMAIL_IN_USE" } });
      }

      expect(await t.prisma.user.count({ where: { email } })).toBe(1);
      const original = await t.prisma.user.findUniqueOrThrow({ where: { email } });
      expect(original.name).toBe("First Owner");
    });

    it.each([
      ["malformed email", { email: "not-an-email", password: PASSWORD, name: "Grower" }],
      ["short password", { email: "a@example.com", password: "short", name: "Grower" }],
      ["short name", { email: "a@example.com", password: PASSWORD, name: "X" }],
      ["missing fields", { email: "a@example.com" }],
      ["non-string password", { email: "a@example.com", password: 1234567890, name: "Grower" }],
      [
        "self-assigned role",
        { email: "admin@example.com", password: PASSWORD, name: "Grower", role: "ADMIN" },
      ],
    ])("rejects %s with a 422 and shared error shape", async (_label, payload) => {
      const response = await jsonRequest(t.baseUrl, "/api/v1/auth/register", { body: payload });
      expect(response.status).toBe(422);
      expect(await response.json()).toMatchObject({
        error: { code: "VALIDATION_ERROR", message: "Invalid request body" },
      });
      expect(await t.prisma.user.count({ where: { email: "admin@example.com" } })).toBe(0);
    });

    it("rejects malformed JSON with a 400 in the shared error shape", async () => {
      const response = await fetch(`${t.baseUrl}/api/v1/auth/register`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{not json",
      });
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ error: { code: "BAD_REQUEST" } });
    });
  });

  describe("login", () => {
    it("accepts valid credentials (any email casing) and starts a usable session", async () => {
      const user = await registerUser(t.baseUrl, "Returning Grower");
      const response = await jsonRequest(t.baseUrl, "/api/v1/auth/login", {
        body: { email: user.email.toUpperCase(), password: PASSWORD },
      });

      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        data: { user: { id: user.id, email: user.email, name: "Returning Grower" } },
      });
      const cookie = sessionCookie(response);

      const me = await jsonRequest(t.baseUrl, "/api/v1/auth/me", { headers: { cookie } });
      expect(me.status).toBe(200);
      expect(await t.prisma.session.count({ where: { userId: user.id } })).toBe(2);
    });

    it("rejects a wrong password and an unknown email with the same 401", async () => {
      const user = await registerUser(t.baseUrl);
      const wrongPassword = await jsonRequest(t.baseUrl, "/api/v1/auth/login", {
        body: { email: user.email, password: "definitely the wrong one" },
      });
      const unknownEmail = await jsonRequest(t.baseUrl, "/api/v1/auth/login", {
        body: { email: uniqueEmail("ghost"), password: PASSWORD },
      });

      expect(wrongPassword.status).toBe(401);
      expect(unknownEmail.status).toBe(401);
      expect(wrongPassword.headers.get("set-cookie")).toBeNull();
      expect(await wrongPassword.json()).toEqual(await unknownEmail.json());
    });

    it("rate-limits repeated login attempts for the same account", async () => {
      const email = uniqueEmail("throttle");
      const statuses: number[] = [];
      for (let attempt = 0; attempt < 7; attempt += 1) {
        const response = await jsonRequest(t.baseUrl, "/api/v1/auth/login", {
          body: { email, password: "wrong password" },
        });
        statuses.push(response.status);
      }
      expect(statuses.slice(0, 5)).toEqual([401, 401, 401, 401, 401]);
      expect(statuses.slice(5)).toEqual([429, 429]);
    });
  });

  describe("authenticated access", () => {
    it("returns the current user for a valid session", async () => {
      const user = await registerUser(t.baseUrl, "Session Owner");
      const response = await jsonRequest(t.baseUrl, "/api/v1/auth/me", {
        headers: { cookie: user.cookie },
      });
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        data: { user: { id: user.id, email: user.email, name: "Session Owner" } },
      });
    });

    it.each([
      ["no credentials", {}],
      ["an unknown cookie token", { cookie: "leaf_root_session=not-a-real-token" }],
      ["an unknown bearer token", { authorization: "Bearer not-a-real-token" }],
      ["a malformed authorization header", { authorization: "Basic abc" }],
    ])("rejects /auth/me with %s", async (_label, headers) => {
      const response = await jsonRequest(t.baseUrl, "/api/v1/auth/me", { headers });
      expect(response.status).toBe(401);
      expect(await response.json()).toMatchObject({ error: { code: "UNAUTHORIZED" } });
    });

    it("rejects a session whose expiry has passed", async () => {
      const user = await registerUser(t.baseUrl);
      await t.prisma.session.updateMany({
        where: { userId: user.id },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });

      const response = await jsonRequest(t.baseUrl, "/api/v1/auth/me", {
        headers: { cookie: user.cookie },
      });
      expect(response.status).toBe(401);
    });

    it("sweeps the user's expired sessions on the next login", async () => {
      const user = await registerUser(t.baseUrl);
      await t.prisma.session.updateMany({
        where: { userId: user.id },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });

      const login = await jsonRequest(t.baseUrl, "/api/v1/auth/login", {
        body: { email: user.email, password: PASSWORD },
      });
      expect(login.status).toBe(200);
      expect(await t.prisma.session.count({ where: { userId: user.id } })).toBe(1);
    });
  });

  describe("logout", () => {
    it("invalidates the session server-side so a replayed cookie stops working", async () => {
      const user = await registerUser(t.baseUrl);
      const logout = await jsonRequest(t.baseUrl, "/api/v1/auth/logout", {
        method: "POST",
        headers: { cookie: user.cookie },
      });
      expect(logout.status).toBe(204);
      expect(logout.headers.get("set-cookie")).toMatch(/leaf_root_session=;/);

      expect(await t.prisma.session.count({ where: { userId: user.id } })).toBe(0);
      const replay = await jsonRequest(t.baseUrl, "/api/v1/auth/me", {
        headers: { cookie: user.cookie },
      });
      expect(replay.status).toBe(401);
    });

    it("only ends the session it was called with", async () => {
      const user = await registerUser(t.baseUrl);
      const second = await jsonRequest(t.baseUrl, "/api/v1/auth/login", {
        body: { email: user.email, password: PASSWORD },
      });
      const secondCookie = sessionCookie(second);

      await jsonRequest(t.baseUrl, "/api/v1/auth/logout", {
        method: "POST",
        headers: { cookie: user.cookie },
      });

      const stillValid = await jsonRequest(t.baseUrl, "/api/v1/auth/me", {
        headers: { cookie: secondCookie },
      });
      expect(stillValid.status).toBe(200);
    });

    it("is idempotent without credentials", async () => {
      const response = await jsonRequest(t.baseUrl, "/api/v1/auth/logout", { method: "POST" });
      expect(response.status).toBe(204);
    });
  });

  describe("bearer transport for native clients", () => {
    it("returns the token in the body instead of a cookie and honours Authorization", async () => {
      const email = uniqueEmail("mobile");
      const register = await jsonRequest(t.baseUrl, "/api/v1/auth/register", {
        body: { email, password: PASSWORD, name: "Mobile Grower" },
        headers: { "x-auth-transport": "bearer" },
      });
      expect(register.status).toBe(201);
      expect(register.headers.get("set-cookie")).toBeNull();
      const { data } = (await register.json()) as {
        data: { token: string; expiresAt: string; user: { email: string } };
      };
      expect(data.token.length).toBeGreaterThan(30);
      expect(new Date(data.expiresAt).getTime()).toBeGreaterThan(Date.now());

      const authorization = `Bearer ${data.token}`;
      const me = await jsonRequest(t.baseUrl, "/api/v1/users/me", { headers: { authorization } });
      expect(me.status).toBe(200);

      await jsonRequest(t.baseUrl, "/api/v1/auth/logout", {
        method: "POST",
        headers: { authorization },
      });
      const replay = await jsonRequest(t.baseUrl, "/api/v1/users/me", {
        headers: { authorization },
      });
      expect(replay.status).toBe(401);
    });
  });
});
