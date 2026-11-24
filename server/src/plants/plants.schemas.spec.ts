import { describe, expect, it } from "vitest";
import {
  createPlantSchema,
  listPlantsQuerySchema,
  plantIdSchema,
  updatePlantSchema,
} from "./plants.schemas.js";

const FORBIDDEN_KEYS = ["userId", "id", "status", "createdAt", "updatedAt", "role", "deletedAt"];

describe("createPlantSchema", () => {
  it("accepts only a name and trims it", () => {
    expect(createPlantSchema.parse({ name: "  Monstera  " })).toEqual({ name: "Monstera" });
  });

  it("accepts all optional fields and treats null as no value", () => {
    expect(
      createPlantSchema.parse({ name: "Pothos", species: " Epipremnum ", location: null, notes: "Water weekly" }),
    ).toEqual({ name: "Pothos", species: "Epipremnum", location: null, notes: "Water weekly" });
  });

  it.each([
    ["missing name", {}],
    ["empty name", { name: "" }],
    ["whitespace-only name", { name: "   " }],
    ["non-string name", { name: 42 }],
    ["null name", { name: null }],
    ["name over 80 characters", { name: "a".repeat(81) }],
    ["species over 120 characters", { name: "x", species: "a".repeat(121) }],
    ["location over 80 characters", { name: "x", location: "a".repeat(81) }],
    ["notes over 1000 characters", { name: "x", notes: "a".repeat(1001) }],
    ["empty-string species (send null instead)", { name: "x", species: "" }],
    ["non-string location", { name: "x", location: 5 }],
  ])("rejects %s", (_label, input) => {
    expect(createPlantSchema.safeParse(input).success).toBe(false);
  });

  it("accepts values exactly at the limits", () => {
    const input = {
      name: "a".repeat(80),
      species: "b".repeat(120),
      location: "c".repeat(80),
      notes: "d".repeat(1000),
    };
    expect(createPlantSchema.parse(input)).toEqual(input);
  });

  it.each(FORBIDDEN_KEYS)("rejects the client-controlled field %s", (key) => {
    expect(createPlantSchema.safeParse({ name: "x", [key]: "value" }).success).toBe(false);
  });
});

describe("updatePlantSchema", () => {
  it("accepts a partial update and leaves other keys absent", () => {
    expect(updatePlantSchema.parse({ location: " Kitchen " })).toEqual({ location: "Kitchen" });
  });

  it("allows clearing optional fields with null", () => {
    expect(updatePlantSchema.parse({ species: null, location: null, notes: null })).toEqual({
      species: null,
      location: null,
      notes: null,
    });
  });

  it("rejects an empty update", () => {
    expect(updatePlantSchema.safeParse({}).success).toBe(false);
  });

  it("rejects clearing or blanking the required name", () => {
    expect(updatePlantSchema.safeParse({ name: null }).success).toBe(false);
    expect(updatePlantSchema.safeParse({ name: "  " }).success).toBe(false);
  });

  it.each(FORBIDDEN_KEYS)("rejects the client-controlled field %s", (key) => {
    expect(updatePlantSchema.safeParse({ name: "x", [key]: "value" }).success).toBe(false);
  });

  it("applies the same length limits as creation", () => {
    expect(updatePlantSchema.safeParse({ notes: "a".repeat(1001) }).success).toBe(false);
    expect(updatePlantSchema.safeParse({ name: "a".repeat(81) }).success).toBe(false);
  });
});

describe("listPlantsQuerySchema", () => {
  it("applies defaults", () => {
    expect(listPlantsQuerySchema.parse({})).toEqual({ limit: 50, offset: 0 });
  });

  it("coerces query-string numbers", () => {
    expect(listPlantsQuerySchema.parse({ limit: "10", offset: "20" })).toEqual({ limit: 10, offset: 20 });
  });

  it.each([
    ["limit 0", { limit: "0" }],
    ["limit 101", { limit: "101" }],
    ["negative offset", { offset: "-1" }],
    ["fractional limit", { limit: "1.5" }],
    ["non-numeric limit", { limit: "abc" }],
    ["repeated limit", { limit: ["1", "2"] }],
    ["unknown parameter", { userId: "x" }],
  ])("rejects %s", (_label, input) => {
    expect(listPlantsQuerySchema.safeParse(input).success).toBe(false);
  });
});

describe("plantIdSchema", () => {
  it("accepts a UUID", () => {
    const id = "0b7e1a5e-3c6d-4f0a-9b2e-6f1d2c3b4a59";
    expect(plantIdSchema.parse(id)).toBe(id);
  });

  it.each(["", "abc", "123", "not-a-uuid", "0b7e1a5e-3c6d-4f0a-9b2e", "../../etc/passwd"])(
    "rejects %j",
    (value) => {
      expect(plantIdSchema.safeParse(value).success).toBe(false);
    },
  );
});
