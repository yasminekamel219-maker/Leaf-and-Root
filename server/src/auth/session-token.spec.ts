import { describe, expect, it } from "vitest";
import { createSessionToken, hashSessionToken } from "./session-token.js";

describe("session tokens", () => {
  it("creates a different opaque token for each session", () => {
    expect(createSessionToken()).not.toBe(createSessionToken());
  });

  it("hashes the same token deterministically without storing the token itself", () => {
    const token = createSessionToken();

    expect(hashSessionToken(token)).toBe(hashSessionToken(token));
    expect(hashSessionToken(token)).not.toContain(token);
  });
});
