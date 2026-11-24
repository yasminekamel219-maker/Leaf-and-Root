import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  jsonRequest,
  registerUser,
  startTestApp,
  type TestApp,
} from "../test/http.js";

type PlantJson = {
  id: string;
  name: string;
  species: string | null;
  location: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};
type User = Awaited<ReturnType<typeof registerUser>>;

const read = async <T>(response: Response) => (await response.json()) as T;
const plantsOf = (t: TestApp, userId: string) =>
  t.prisma.plant.findMany({ where: { userId }, orderBy: { createdAt: "asc" } });

describe("plants API: authentication, create, list, detail", () => {
  let t: TestApp;
  let alice: User;
  let bob: User;

  const api = (path: string, options: Parameters<typeof jsonRequest>[2] = {}) =>
    jsonRequest(t.baseUrl, `/api/v1${path}`, options);
  const as = (user: User) => ({ cookie: user.cookie });
  const seed = (userId: string, data: { name: string; createdAt?: Date; id?: string }) =>
    t.prisma.plant.create({ data: { userId, ...data } });

  beforeAll(async () => {
    t = await startTestApp();
    alice = await registerUser(t.baseUrl, "Alice Owner");
    bob = await registerUser(t.baseUrl, "Bob Owner");
  });

  afterAll(async () => {
    await t.close();
  });

  describe("authentication", () => {
    const targets: Array<[string, string, unknown?]> = [
      ["POST", "/plants", { name: "Anon" }],
      ["GET", "/plants"],
      ["GET", `/plants/${randomUUID()}`],
      ["PATCH", `/plants/${randomUUID()}`, { name: "Anon" }],
    ];

    it.each(targets)("rejects %s %s without credentials", async (method, path, body) => {
      const response = await api(path, { method, body });
      expect(response.status).toBe(401);
      expect(await response.json()).toMatchObject({ error: { code: "UNAUTHORIZED" } });
    });

    it("rejects unknown cookie and bearer tokens", async () => {
      const cookie = await api("/plants", { headers: { cookie: "leaf_root_session=not-a-real-token" } });
      const bearer = await api("/plants", { headers: { authorization: "Bearer not-a-real-token" } });
      expect(cookie.status).toBe(401);
      expect(bearer.status).toBe(401);
    });

    it("rejects an expired session and does not create anything", async () => {
      const user = await registerUser(t.baseUrl, "Expiring");
      await t.prisma.session.updateMany({
        where: { userId: user.id },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });

      const list = await api("/plants", { headers: as(user) });
      const create = await api("/plants", { method: "POST", body: { name: "Late" }, headers: as(user) });

      expect(list.status).toBe(401);
      expect(create.status).toBe(401);
      expect(await plantsOf(t, user.id)).toHaveLength(0);
    });

    it("rejects the session after logout", async () => {
      const user = await registerUser(t.baseUrl, "Logging Out");
      await api("/auth/logout", { method: "POST", headers: as(user) });

      const response = await api("/plants", { headers: as(user) });
      expect(response.status).toBe(401);
    });

    it("accepts the bearer transport as well as the cookie", async () => {
      const response = await api("/auth/register", {
        body: { email: `bearer-${randomUUID()}@example.com`, password: "correct horse battery staple", name: "Bearer" },
        headers: { "x-auth-transport": "bearer" },
      });
      const { token } = (await read<{ data: { token: string } }>(response)).data;

      const list = await api("/plants", { headers: { authorization: `Bearer ${token}` } });
      expect(list.status).toBe(200);
    });
  });

  describe("create (POST /plants)", () => {
    it("creates a plant owned by the session user and persists it", async () => {
      const response = await api("/plants", {
        method: "POST",
        headers: as(alice),
        body: { name: "  Monstera  ", species: "Monstera deliciosa", location: "Living room", notes: "Bright light" },
      });

      expect(response.status).toBe(201);
      const { data } = await read<{ data: { plant: PlantJson } }>(response);
      expect(data.plant).toMatchObject({
        name: "Monstera",
        species: "Monstera deliciosa",
        location: "Living room",
        notes: "Bright light",
      });
      expect(Object.keys(data.plant).sort()).toEqual(
        ["createdAt", "id", "location", "name", "notes", "species", "updatedAt"],
      );

      const row = await t.prisma.plant.findUniqueOrThrow({ where: { id: data.plant.id } });
      expect(row.userId).toBe(alice.id);
      expect(row.name).toBe("Monstera");
      expect(row.createdAt.toISOString()).toBe(data.plant.createdAt);
    });

    it("creates a plant from only a name; optional fields are null", async () => {
      const response = await api("/plants", { method: "POST", headers: as(alice), body: { name: "Fern" } });

      expect(response.status).toBe(201);
      const { data } = await read<{ data: { plant: PlantJson } }>(response);
      expect(data.plant).toMatchObject({ name: "Fern", species: null, location: null, notes: null });
    });

    it.each([
      ["missing name", {}],
      ["empty name", { name: "" }],
      ["whitespace-only name", { name: "   " }],
      ["non-string name", { name: 7 }],
      ["name over 80 characters", { name: "a".repeat(81) }],
      ["notes over 1000 characters", { name: "Ok", notes: "n".repeat(1001) }],
    ])("rejects %s with 422 and stores nothing", async (_label, body) => {
      const user = await registerUser(t.baseUrl, "Validation");
      const response = await api("/plants", { method: "POST", headers: as(user), body });

      expect(response.status).toBe(422);
      expect(await response.json()).toMatchObject({ error: { code: "VALIDATION_ERROR" } });
      expect(await plantsOf(t, user.id)).toHaveLength(0);
    });

    it("rejects malformed JSON with 400", async () => {
      const response = await fetch(`${t.baseUrl}/api/v1/plants`, {
        method: "POST",
        headers: { "content-type": "application/json", cookie: alice.cookie },
        body: "{not json",
      });
      expect(response.status).toBe(400);
    });

    it.each(["userId", "id", "status", "createdAt", "updatedAt", "role", "deletedAt"])(
      "rejects the client-controlled field %s and stores nothing",
      async (field) => {
        const user = await registerUser(t.baseUrl, "Mass Assignment");
        const response = await api("/plants", {
          method: "POST",
          headers: as(user),
          body: { name: "Sneaky", [field]: field === "userId" || field === "id" ? randomUUID() : "x" },
        });

        expect(response.status).toBe(422);
        expect(await plantsOf(t, user.id)).toHaveLength(0);
      },
    );

    it("cannot assign a plant to another user through the body", async () => {
      const before = await plantsOf(t, bob.id);
      const response = await api("/plants", {
        method: "POST",
        headers: as(alice),
        body: { name: "Gift", userId: bob.id },
      });

      expect(response.status).toBe(422);
      expect(await plantsOf(t, bob.id)).toHaveLength(before.length);
      expect(await t.prisma.plant.count({ where: { name: "Gift" } })).toBe(0);
    });
  });

  describe("list (GET /plants)", () => {
    it("returns an empty page with metadata for a user without plants", async () => {
      const user = await registerUser(t.baseUrl, "Empty");
      const response = await api("/plants", { headers: as(user) });

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        data: { plants: [] },
        meta: { total: 0, limit: 50, offset: 0 },
      });
    });

    it("lists only the authenticated user's plants", async () => {
      const first = await registerUser(t.baseUrl, "Lister One");
      const second = await registerUser(t.baseUrl, "Lister Two");
      const mine = await Promise.all(["A1", "A2", "A3"].map((name) => seed(first.id, { name })));
      await Promise.all(["B1", "B2"].map((name) => seed(second.id, { name })));

      const response = await api("/plants", { headers: as(first) });
      const body = await read<{ data: { plants: PlantJson[] }; meta: { total: number } }>(response);

      expect(response.status).toBe(200);
      expect(body.data.plants.map((p) => p.id).sort()).toEqual(mine.map((p) => p.id).sort());
      expect(body.meta.total).toBe(3);
      expect(JSON.stringify(body)).not.toContain("userId");
      expect(JSON.stringify(body)).not.toContain(second.id);
    });

    it("orders newest first with a stable tie-breaker and paginates with total metadata", async () => {
      const user = await registerUser(t.baseUrl, "Paginator");
      const base = Date.now() - 60_000;
      const at = (offsetMs: number) => new Date(base + offsetMs);
      const [tieFirst, tieSecond] = [randomUUID(), randomUUID()].sort();
      const oldest = await seed(user.id, { name: "oldest", createdAt: at(0) });
      const middle = await seed(user.id, { name: "middle", createdAt: at(1000) });
      const tieB = await seed(user.id, { name: "tie-b", createdAt: at(2000), id: tieSecond });
      const tieA = await seed(user.id, { name: "tie-a", createdAt: at(2000), id: tieFirst });
      const newest = await seed(user.id, { name: "newest", createdAt: at(3000) });
      const expected = [newest, tieA, tieB, middle, oldest].map((p) => p.id);

      const page = async (query: string) =>
        read<{ data: { plants: PlantJson[] }; meta: { total: number; limit: number; offset: number } }>(
          await api(`/plants${query}`, { headers: as(user) }),
        );

      const all = await page("");
      expect(all.data.plants.map((p) => p.id)).toEqual(expected);
      expect(all.meta).toEqual({ total: 5, limit: 50, offset: 0 });

      const first = await page("?limit=2");
      const second = await page("?limit=2&offset=2");
      const third = await page("?limit=2&offset=4");
      const beyond = await page("?limit=2&offset=5");
      expect(first.data.plants.map((p) => p.id)).toEqual(expected.slice(0, 2));
      expect(second.data.plants.map((p) => p.id)).toEqual(expected.slice(2, 4));
      expect(third.data.plants.map((p) => p.id)).toEqual(expected.slice(4));
      expect(beyond.data.plants).toEqual([]);
      expect(beyond.meta).toEqual({ total: 5, limit: 2, offset: 5 });
    });

    it.each([
      ["limit=0", "?limit=0"],
      ["limit=101", "?limit=101"],
      ["offset=-1", "?offset=-1"],
      ["limit=abc", "?limit=abc"],
      ["limit=1.5", "?limit=1.5"],
      ["an unknown parameter", "?userId=anything"],
    ])("rejects %s with 422", async (_label, query) => {
      const response = await api(`/plants${query}`, { headers: as(alice) });
      expect(response.status).toBe(422);
      expect(await response.json()).toMatchObject({ error: { code: "VALIDATION_ERROR" } });
    });
  });

  describe("detail (GET /plants/:id)", () => {
    it("returns an owned plant", async () => {
      const plant = await seed(alice.id, { name: "Detail" });
      const response = await api(`/plants/${plant.id}`, { headers: as(alice) });

      expect(response.status).toBe(200);
      const { data } = await read<{ data: { plant: PlantJson } }>(response);
      expect(data.plant).toMatchObject({ id: plant.id, name: "Detail", species: null });
    });

    it("answers identically for another user's plant, a missing plant, and an invalid id", async () => {
      const alicePlant = await seed(alice.id, { name: "Private" });
      const foreign = await api(`/plants/${alicePlant.id}`, { headers: as(bob) });
      const missing = await api(`/plants/${randomUUID()}`, { headers: as(bob) });
      const invalid = await api("/plants/not-a-uuid", { headers: as(bob) });

      for (const response of [foreign, missing, invalid]) expect(response.status).toBe(404);
      const bodies = await Promise.all([foreign, missing, invalid].map((r) => r.json()));
      expect(bodies[0]).toEqual(bodies[1]);
      expect(bodies[0]).toEqual(bodies[2]);
      expect(bodies[0]).toMatchObject({ error: { code: "NOT_FOUND" } });
      expect(JSON.stringify(bodies[0])).not.toContain("Private");
    });
  });

  describe("scope guard rails", () => {
    it("exposes no DELETE operation and leaves the plant in place", async () => {
      const plant = await seed(alice.id, { name: "Undeletable" });
      const response = await api(`/plants/${plant.id}`, { method: "DELETE", headers: as(alice) });

      expect(response.status).toBe(404);
      expect(await t.prisma.plant.findUnique({ where: { id: plant.id } })).not.toBeNull();
    });

    it("documents exactly the four operations in OpenAPI and no delete", async () => {
      const response = await fetch(`${t.baseUrl}/api/docs-json`);
      const document = (await response.json()) as {
        paths: Record<string, Record<string, { responses?: Record<string, unknown> }>>;
      };
      const plantPaths = Object.keys(document.paths).filter((path) => path.startsWith("/api/v1/plants"));

      expect(plantPaths.sort()).toEqual(["/api/v1/plants", "/api/v1/plants/{id}"]);
      expect(Object.keys(document.paths["/api/v1/plants"]!).sort()).toEqual(["get", "post"]);
      expect(Object.keys(document.paths["/api/v1/plants/{id}"]!).sort()).toEqual(["get", "patch"]);
      expect(Object.keys(document.paths["/api/v1/plants/{id}"]!.get!.responses!)).toEqual(
        expect.arrayContaining(["200", "401", "404"]),
      );
      expect(Object.keys(document.paths["/api/v1/plants/{id}"]!.patch!.responses!)).toEqual(
        expect.arrayContaining(["200", "401", "404", "422"]),
      );
    });
  });
});
