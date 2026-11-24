import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { jsonRequest, registerUser, startTestApp, type TestApp } from "../test/http.js";

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
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("plants API: update, ownership isolation, database constraints", () => {
  let t: TestApp;
  let alice: User;
  let bob: User;

  const api = (path: string, options: Parameters<typeof jsonRequest>[2] = {}) =>
    jsonRequest(t.baseUrl, `/api/v1${path}`, options);
  const as = (user: User) => ({ cookie: user.cookie });
  const patch = (user: User, id: string, body: unknown) =>
    api(`/plants/${id}`, { method: "PATCH", headers: as(user), body });
  const seed = (userId: string, data: Partial<{ name: string; species: string; location: string; notes: string }> = {}) =>
    t.prisma.plant.create({
      data: { userId, name: "Seed", species: "Species", location: "Location", notes: "Notes", ...data },
    });
  const row = (id: string) => t.prisma.plant.findUniqueOrThrow({ where: { id } });

  beforeAll(async () => {
    t = await startTestApp();
    alice = await registerUser(t.baseUrl, "Alice Owner");
    bob = await registerUser(t.baseUrl, "Bob Owner");
  });

  afterAll(async () => {
    await t.close();
  });

  describe("update (PATCH /plants/:id)", () => {
    it("changes only the supplied field and leaves everything else untouched", async () => {
      const plant = await seed(alice.id, { name: "Before", location: "Hall" });
      await sleep(20);

      const response = await patch(alice, plant.id, { location: "  Kitchen  " });

      expect(response.status).toBe(200);
      const { data } = await read<{ data: { plant: PlantJson } }>(response);
      expect(data.plant).toMatchObject({
        id: plant.id,
        name: "Before",
        species: "Species",
        notes: "Notes",
        location: "Kitchen",
      });
      const after = await row(plant.id);
      expect(after.userId).toBe(alice.id);
      expect(after.name).toBe("Before");
      expect(after.location).toBe("Kitchen");
      expect(after.createdAt).toEqual(plant.createdAt);
      expect(after.updatedAt.getTime()).toBeGreaterThan(plant.updatedAt.getTime());
      expect(data.plant.updatedAt).toBe(after.updatedAt.toISOString());
    });

    it("renames a plant and trims the name", async () => {
      const plant = await seed(alice.id);
      const response = await patch(alice, plant.id, { name: "  Renamed  " });

      expect(response.status).toBe(200);
      expect((await row(plant.id)).name).toBe("Renamed");
    });

    it("clears optional fields with null without touching the others", async () => {
      const plant = await seed(alice.id);

      const some = await patch(alice, plant.id, { species: null, notes: null });
      expect(some.status).toBe(200);
      expect(await row(plant.id)).toMatchObject({
        name: "Seed",
        species: null,
        notes: null,
        location: "Location",
      });

      const rest = await patch(alice, plant.id, { location: null });
      expect(rest.status).toBe(200);
      expect(await row(plant.id)).toMatchObject({ name: "Seed", species: null, location: null, notes: null });
    });

    it.each([
      ["an empty object", {}],
      ["a null name", { name: null }],
      ["a blank name", { name: "   " }],
      ["a name over 80 characters", { name: "a".repeat(81) }],
      ["notes over 1000 characters", { notes: "n".repeat(1001) }],
      ["an empty-string species", { species: "" }],
    ])("rejects %s with 422 and leaves the row unchanged", async (_label, body) => {
      const plant = await seed(alice.id);
      const response = await patch(alice, plant.id, body);

      expect(response.status).toBe(422);
      expect(await response.json()).toMatchObject({ error: { code: "VALIDATION_ERROR" } });
      expect(await row(plant.id)).toEqual(plant);
    });

    it.each(["userId", "id", "status", "createdAt", "updatedAt", "role", "deletedAt"])(
      "rejects the client-controlled field %s and leaves the row unchanged",
      async (field) => {
        const plant = await seed(alice.id);
        const value = field === "userId" || field === "id" ? bob.id : "x";
        const response = await patch(alice, plant.id, { name: "Changed", [field]: value });

        expect(response.status).toBe(422);
        expect(await row(plant.id)).toEqual(plant);
      },
    );

    it("answers 404 for a missing plant and an invalid id", async () => {
      const missing = await patch(alice, randomUUID(), { name: "Nope" });
      const invalid = await patch(alice, "not-a-uuid", { name: "Nope" });

      expect(missing.status).toBe(404);
      expect(invalid.status).toBe(404);
      expect(await missing.json()).toEqual(await invalid.json());
    });
  });

  describe("ownership isolation between two users", () => {
    it("lets user B neither read, list, nor modify user A's plant, and changes nothing", async () => {
      const plant = await seed(alice.id, { name: "Alice Only" });
      const bobPlant = await seed(bob.id, { name: "Bob Only" });

      const detail = await api(`/plants/${plant.id}`, { headers: as(bob) });
      const update = await patch(bob, plant.id, { name: "Hijacked", notes: null });
      const missing = await patch(bob, randomUUID(), { name: "Hijacked" });
      const list = await read<{ data: { plants: PlantJson[] }; meta: { total: number } }>(
        await api("/plants?limit=100", { headers: as(bob) }),
      );

      expect(detail.status).toBe(404);
      expect(update.status).toBe(404);
      expect(await update.json()).toEqual(await missing.json());
      expect(list.data.plants.map((p) => p.id)).toContain(bobPlant.id);
      expect(list.data.plants.map((p) => p.id)).not.toContain(plant.id);
      expect(await row(plant.id)).toEqual(plant);
    });

    it("lets user A still read and update their own plant afterwards", async () => {
      const plant = await seed(alice.id, { name: "Still Mine" });
      await patch(bob, plant.id, { name: "Hijacked" });

      const update = await patch(alice, plant.id, { name: "Still Mine 2" });
      expect(update.status).toBe(200);
      expect((await row(plant.id)).name).toBe("Still Mine 2");
    });

    it("cannot move a plant to another user through the body", async () => {
      const plant = await seed(alice.id);
      const response = await patch(alice, plant.id, { userId: bob.id });

      expect(response.status).toBe(422);
      expect((await row(plant.id)).userId).toBe(alice.id);
    });

    it("gives an ADMIN no ownership bypass", async () => {
      const admin = await registerUser(t.baseUrl, "Platform Admin");
      await t.prisma.user.update({ where: { id: admin.id }, data: { role: "ADMIN" } });
      const plant = await seed(alice.id, { name: "Not For Admin" });

      const detail = await api(`/plants/${plant.id}`, { headers: as(admin) });
      const update = await patch(admin, plant.id, { name: "Admin Edit" });
      const list = await read<{ data: { plants: PlantJson[] }; meta: { total: number } }>(
        await api("/plants", { headers: as(admin) }),
      );

      expect(detail.status).toBe(404);
      expect(update.status).toBe(404);
      expect(list.meta.total).toBe(0);
      expect(await row(plant.id)).toEqual(plant);
    });
  });

  describe("database-level constraints (migration applied to the test database)", () => {
    it("rejects a plant whose owner does not exist", async () => {
      await expect(
        t.prisma.plant.create({ data: { userId: randomUUID(), name: "Orphan" } }),
      ).rejects.toThrow();
    });

    it("restricts deleting a user who owns plants (no cascade) and keeps both rows", async () => {
      const owner = await registerUser(t.baseUrl, "Has Plants");
      const plant = await seed(owner.id);

      await expect(t.prisma.user.delete({ where: { id: owner.id } })).rejects.toThrow();

      expect(await t.prisma.user.findUnique({ where: { id: owner.id } })).not.toBeNull();
      expect(await row(plant.id)).toEqual(plant);
      // confdeltype 'r' = ON DELETE RESTRICT ('c' would be CASCADE); cast because Prisma cannot read "char".
      const rule = await t.prisma.$queryRaw<Array<{ confdeltype: string }>>`
        SELECT confdeltype::text AS confdeltype FROM pg_constraint WHERE conname = 'Plant_userId_fkey'`;
      expect(rule).toEqual([{ confdeltype: "r" }]);
    });

    it("still deletes a user without plants, and their sessions go with them", async () => {
      const owner = await registerUser(t.baseUrl, "No Plants");

      await t.prisma.user.delete({ where: { id: owner.id } });

      expect(await t.prisma.session.count({ where: { userId: owner.id } })).toBe(0);
    });

    it("has an index supporting user-scoped listing", async () => {
      const indexes = await t.prisma.$queryRaw<Array<{ indexdef: string }>>`
        SELECT indexdef FROM pg_indexes WHERE tablename = 'Plant'`;
      expect(indexes.some((index) => /"userId", "createdAt"/.test(index.indexdef))).toBe(true);
    });
  });
});
