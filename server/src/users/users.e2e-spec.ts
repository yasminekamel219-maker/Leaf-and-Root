import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { jsonRequest, registerUser, startTestApp, type TestApp } from "../test/http.js";

describe("user profile API (/api/v1/users/me)", () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await startTestApp();
  });

  afterAll(async () => {
    await t.close();
  });

  it("requires authentication for both operations", async () => {
    const read = await jsonRequest(t.baseUrl, "/api/v1/users/me");
    const write = await jsonRequest(t.baseUrl, "/api/v1/users/me", {
      method: "PATCH",
      body: { name: "Anonymous" },
    });

    for (const response of [read, write]) {
      expect(response.status).toBe(401);
      expect(await response.json()).toMatchObject({ error: { code: "UNAUTHORIZED" } });
    }
  });

  it("returns the authenticated user's profile without sensitive fields", async () => {
    const user = await registerUser(t.baseUrl, "Profile Owner");
    const response = await jsonRequest(t.baseUrl, "/api/v1/users/me", {
      headers: { cookie: user.cookie },
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as { data: { user: Record<string, unknown> } };
    expect(body.data.user).toMatchObject({ id: user.id, email: user.email, name: "Profile Owner" });
    expect(Object.keys(body.data.user)).not.toEqual(
      expect.arrayContaining(["passwordHash", "role"]),
    );
  });

  it("updates the name, persists it, and trims whitespace", async () => {
    const user = await registerUser(t.baseUrl, "Before Name");
    const before = await t.prisma.user.findUniqueOrThrow({ where: { id: user.id } });

    const response = await jsonRequest(t.baseUrl, "/api/v1/users/me", {
      method: "PATCH",
      body: { name: "  After Name  " },
      headers: { cookie: user.cookie },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      data: { user: { id: user.id, email: user.email, name: "After Name" } },
    });
    const after = await t.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(after.name).toBe("After Name");
    expect(after.updatedAt.getTime()).toBeGreaterThanOrEqual(before.updatedAt.getTime());
    expect(after.passwordHash).toBe(before.passwordHash);
  });

  it("only ever changes the caller's own profile", async () => {
    const alice = await registerUser(t.baseUrl, "Alice Original");
    const bob = await registerUser(t.baseUrl, "Bob Original");

    // Attempting to target another account by id has no effect: `id` is not an accepted field.
    const attack = await jsonRequest(t.baseUrl, "/api/v1/users/me", {
      method: "PATCH",
      body: { id: bob.id, name: "Hijacked" },
      headers: { cookie: alice.cookie },
    });
    expect(attack.status).toBe(422);

    const update = await jsonRequest(t.baseUrl, "/api/v1/users/me", {
      method: "PATCH",
      body: { name: "Alice Updated" },
      headers: { cookie: alice.cookie },
    });
    expect(update.status).toBe(200);

    const bobRow = await t.prisma.user.findUniqueOrThrow({ where: { id: bob.id } });
    expect(bobRow.name).toBe("Bob Original");
  });

  it.each([
    ["role escalation", { role: "ADMIN" }],
    ["email change", { email: "someone-else@example.com" }],
    ["password change", { password: "a brand new password" }],
    ["empty body", {}],
    ["too-short name", { name: "X" }],
    ["too-long name", { name: "N".repeat(81) }],
  ])("rejects %s with a 422 and leaves the account unchanged", async (_label, payload) => {
    const user = await registerUser(t.baseUrl, "Stable Name");
    const before = await t.prisma.user.findUniqueOrThrow({ where: { id: user.id } });

    const response = await jsonRequest(t.baseUrl, "/api/v1/users/me", {
      method: "PATCH",
      body: payload,
      headers: { cookie: user.cookie },
    });

    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ error: { code: "VALIDATION_ERROR" } });
    const after = await t.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(after).toEqual(before);
    expect(after.role).toBe("USER");
  });
});
