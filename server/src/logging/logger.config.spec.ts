import { Writable } from "node:stream";
import { pino } from "pino";
import { describe, expect, it } from "vitest";
import { createPinoHttpOptions, REDACTED_PATHS } from "./logger.config.js";

function capture() {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      lines.push(String(chunk));
      callback();
    },
  });
  const options = createPinoHttpOptions({ LOG_LEVEL: "info", NODE_ENV: "development" });
  const logger = pino(
    { level: "info", redact: options.redact, serializers: options.serializers },
    stream,
  );
  return { logger, output: () => lines.join("") };
}

describe("logger redaction", () => {
  it("redacts credentials from hand-logged objects", () => {
    const { logger, output } = capture();
    logger.info(
      {
        password: "hunter2-super-secret",
        user: { passwordHash: "scrypt$abc", token: "tok-123" },
        req: { headers: { authorization: "Bearer tok-123", cookie: "leaf_root_session=tok-123" } },
        res: { headers: { "set-cookie": "leaf_root_session=tok-123" } },
      },
      "attempt",
    );

    const text = output();
    expect(text).not.toContain("hunter2-super-secret");
    expect(text).not.toContain("scrypt$abc");
    expect(text).not.toContain("tok-123");
    expect(text).toContain("[REDACTED]");
  });

  it("serializes requests without headers, bodies or query strings", () => {
    const { logger, output } = capture();
    logger.info(
      {
        req: {
          id: "r1",
          method: "POST",
          url: "/api/v1/auth/login?token=leak",
          headers: { cookie: "leaf_root_session=tok-999" },
          body: { password: "pw-leak" },
        },
      },
      "request",
    );

    const text = output();
    expect(text).toContain("/api/v1/auth/login");
    expect(text).not.toContain("token=leak");
    expect(text).not.toContain("tok-999");
    expect(text).not.toContain("pw-leak");
  });

  it("covers the credential fields we know about", () => {
    expect(REDACTED_PATHS).toEqual(
      expect.arrayContaining(["req.headers.authorization", "req.headers.cookie", "*.password"]),
    );
  });
});
