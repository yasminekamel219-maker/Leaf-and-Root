import { describe, expect, it } from "vitest";
import { CURRENT_PARAMS, hashPassword, needsRehash, verifyPassword } from "./password.js";

const LEGACY_PARAMS = { N: 16_384, r: 8, p: 1 };

describe("password hashing", () => {
  it("verifies the password used to create a hash", async () => {
    const hash = await hashPassword("correct horse battery staple");

    await expect(verifyPassword("correct horse battery staple", hash)).resolves.toBe(true);
  });

  it("rejects a different password", async () => {
    const hash = await hashPassword("correct horse battery staple");

    await expect(verifyPassword("wrong password", hash)).resolves.toBe(false);
  });

  it("uses a unique salt for every password", async () => {
    const first = await hashPassword("same password");
    const second = await hashPassword("same password");

    expect(first).not.toBe(second);
  });

  it("rejects malformed stored hashes", async () => {
    await expect(verifyPassword("anything", "not-a-password-hash")).resolves.toBe(false);
  });

  it("hashes with the OWASP-aligned current parameters", async () => {
    const hash = await hashPassword("pw");

    expect(hash.startsWith(`scrypt$${CURRENT_PARAMS.N}$${CURRENT_PARAMS.r}$${CURRENT_PARAMS.p}$`)).toBe(true);
    expect(needsRehash(hash)).toBe(false);
  });

  it("still verifies hashes created with the old, weaker parameters and flags them for upgrade", async () => {
    const legacy = await hashPassword("existing user password", LEGACY_PARAMS);

    expect(legacy.startsWith("scrypt$16384$8$1$")).toBe(true);
    await expect(verifyPassword("existing user password", legacy)).resolves.toBe(true);
    await expect(verifyPassword("wrong password", legacy)).resolves.toBe(false);
    expect(needsRehash(legacy)).toBe(true);
  });

  it("refuses stored parameters that are invalid or would exhaust memory", async () => {
    const salt = "c2FsdHNhbHRzYWx0c2FsdA";
    const key = "A".repeat(86);
    for (const bad of [
      `scrypt$1073741824$8$1$${salt}$${key}`,
      `scrypt$16384$1024$1$${salt}$${key}`,
      `scrypt$16383$8$1$${salt}$${key}`,
      `scrypt$0$8$1$${salt}$${key}`,
      `argon2$16384$8$1$${salt}$${key}`,
    ]) {
      await expect(verifyPassword("x", bad)).resolves.toBe(false);
    }
    expect(needsRehash("not-a-hash")).toBe(true);
  });
});
