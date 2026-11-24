import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resetEnvCache } from "../config/env.js";
import { hashPassword } from "./password.js";
import { jsonRequest, PASSWORD, startTestApp, type TestApp, uniqueEmail } from "../test/http.js";

/** Starts the real app with temporary rate-limit settings, then restores the environment. */
async function startWithLimits(limits: { ip: string; account: string }) {
  const previous = {
    ip: process.env.AUTH_RATE_LIMIT_IP,
    account: process.env.AUTH_RATE_LIMIT_ACCOUNT,
  };
  process.env.AUTH_RATE_LIMIT_IP = limits.ip;
  process.env.AUTH_RATE_LIMIT_ACCOUNT = limits.account;
  resetEnvCache();
  const t = await startTestApp();
  return {
    t,
    restore: () => {
      process.env.AUTH_RATE_LIMIT_IP = previous.ip;
      process.env.AUTH_RATE_LIMIT_ACCOUNT = previous.account;
      resetEnvCache();
    },
  };
}

const login = (t: TestApp, email: string) =>
  jsonRequest(t.baseUrl, "/api/v1/auth/login", { body: { email, password: PASSWORD } });

describe("per-IP login window", () => {
  let t: TestApp;
  let restore: () => void;

  beforeAll(async () => {
    ({ t, restore } = await startWithLimits({ ip: "4", account: "1000" }));
  });
  afterAll(async () => {
    await t.close();
    restore();
  });

  it("limits a client that rotates through many different emails", async () => {
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 6; attempt += 1) {
      statuses.push((await login(t, uniqueEmail("stuffing"))).status);
    }
    // Each email is new, so the email+IP window never trips; the IP window must.
    expect(statuses).toEqual([401, 401, 401, 401, 429, 429]);
  });

  it("does not throttle routes that are not credential attempts", async () => {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const response = await jsonRequest(t.baseUrl, "/api/v1/auth/me");
      expect(response.status).toBe(401);
    }
  });
});

describe("per-account login window", () => {
  let t: TestApp;
  let restore: () => void;

  beforeAll(async () => {
    ({ t, restore } = await startWithLimits({ ip: "1000", account: "3" }));
  });
  afterAll(async () => {
    await t.close();
    restore();
  });

  it("caps attempts against one email independently of the email+IP window", async () => {
    const email = uniqueEmail("target");
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 5; attempt += 1) {
      statuses.push((await login(t, email)).status);
    }
    // The email+IP window allows 5, so the 429s from the 4th attempt come from the account window.
    expect(statuses).toEqual([401, 401, 401, 429, 429]);
  });

  it("treats differently cased or padded emails as the same account", async () => {
    const email = uniqueEmail("case");
    const variants = [email, email.toUpperCase(), ` ${email} `, email, email];
    const statuses: number[] = [];
    for (const variant of variants) statuses.push((await login(t, variant)).status);
    expect(statuses).toEqual([401, 401, 401, 429, 429]);
  });
});

describe("password hash upgrade", () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await startTestApp();
  });
  afterAll(async () => {
    await t.close();
  });

  it("logs in an existing account hashed with the old parameters and upgrades its hash", async () => {
    const email = uniqueEmail("legacy");
    const legacyHash = await hashPassword(PASSWORD, { N: 16_384, r: 8, p: 1 });
    await t.prisma.user.create({ data: { email, name: "Legacy User", passwordHash: legacyHash } });

    const wrong = await jsonRequest(t.baseUrl, "/api/v1/auth/login", {
      body: { email, password: "definitely the wrong one" },
    });
    expect(wrong.status).toBe(401);
    expect((await t.prisma.user.findUniqueOrThrow({ where: { email } })).passwordHash).toBe(legacyHash);

    const first = await login(t, email);
    expect(first.status).toBe(200);
    const upgraded = (await t.prisma.user.findUniqueOrThrow({ where: { email } })).passwordHash;
    expect(upgraded).not.toBe(legacyHash);
    expect(upgraded.startsWith("scrypt$65536$8$2$")).toBe(true);

    const second = await login(t, email);
    expect(second.status).toBe(200);
    expect((await t.prisma.user.findUniqueOrThrow({ where: { email } })).passwordHash).toBe(upgraded);
  });
});

describe("malformed credentials never cause a server error", () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await startTestApp();
  });
  afterAll(async () => {
    await t.close();
  });

  it.each(["leaf_root_session=%E0%A4%A", "leaf_root_session=%", "leaf_root_session=%zz"])(
    "answers 401 on /auth/me and 204 on logout for cookie %s",
    async (cookie) => {
      const me = await jsonRequest(t.baseUrl, "/api/v1/auth/me", { headers: { cookie } });
      expect(me.status).toBe(401);
      expect(await me.json()).toMatchObject({ error: { code: "UNAUTHORIZED" } });

      const logout = await jsonRequest(t.baseUrl, "/api/v1/auth/logout", {
        method: "POST",
        headers: { cookie },
      });
      expect(logout.status).toBe(204);
    },
  );
});
