import { describe, expect, it } from "vitest";
import { loginSchema, registerSchema } from "./auth.schemas.js";

describe("auth request schemas", () => {
  it("normalizes registration email and trims the display name", () => {
    const result = registerSchema.parse({
      email: "  GROWER@Example.COM ",
      password: "a secure password",
      name: "  Green Thumb  ",
    });

    expect(result).toEqual({
      email: "grower@example.com",
      password: "a secure password",
      name: "Green Thumb",
    });
  });

  it("rejects short passwords", () => {
    expect(() =>
      registerSchema.parse({ email: "grower@example.com", password: "short", name: "Grower" }),
    ).toThrow();
  });

  it("rejects unknown registration fields", () => {
    expect(() =>
      registerSchema.parse({
        email: "grower@example.com",
        password: "a secure password",
        name: "Grower",
        isAdmin: true,
      }),
    ).toThrow();
  });

  it("normalizes login email", () => {
    expect(
      loginSchema.parse({ email: " GROWER@Example.COM ", password: "a secure password" }).email,
    ).toBe("grower@example.com");
  });
});
