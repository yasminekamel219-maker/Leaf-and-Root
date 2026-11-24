import { describe, expect, it } from "vitest";
import { extractSessionToken } from "./session-auth.guard.js";

const request = (headers: Record<string, string>) => ({ headers });

describe("extractSessionToken", () => {
  it("reads the session cookie among others", () => {
    expect(
      extractSessionToken(request({ cookie: "theme=dark; leaf_root_session=abc123; other=1" })),
    ).toBe("abc123");
  });

  it("reads a bearer token case-insensitively", () => {
    expect(extractSessionToken(request({ authorization: "Bearer tok" }))).toBe("tok");
    expect(extractSessionToken(request({ authorization: "bearer tok" }))).toBe("tok");
  });

  it("prefers Authorization over a stale cookie", () => {
    expect(
      extractSessionToken(
        request({ authorization: "Bearer fresh", cookie: "leaf_root_session=stale" }),
      ),
    ).toBe("fresh");
  });

  it("does not fall back to the cookie when the Authorization scheme is unsupported", () => {
    expect(
      extractSessionToken(
        request({ authorization: "Basic abc", cookie: "leaf_root_session=stale" }),
      ),
    ).toBeUndefined();
  });

  it("treats a cookie with invalid percent-encoding as no credentials instead of throwing", () => {
    expect(
      extractSessionToken(request({ cookie: "leaf_root_session=%E0%A4%A" })),
    ).toBeUndefined();
    expect(extractSessionToken(request({ cookie: "leaf_root_session=%" }))).toBeUndefined();
  });

  it("returns undefined without credentials or with a similarly named cookie", () => {
    expect(extractSessionToken(request({}))).toBeUndefined();
    expect(extractSessionToken(request({ cookie: "xleaf_root_session=nope" }))).toBeUndefined();
    expect(extractSessionToken(request({ authorization: "Bearer" }))).toBeUndefined();
  });
});
