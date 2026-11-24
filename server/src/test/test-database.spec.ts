import { describe, expect, it } from "vitest";
import { resolveTestDatabaseUrl } from "./test-database.js";

describe("resolveTestDatabaseUrl", () => {
  it("derives a *_test database from the development URL", () => {
    const url = resolveTestDatabaseUrl({
      DATABASE_URL: "postgresql://u:p@localhost:5434/leaf_and_root?schema=public",
    });
    expect(new URL(url).pathname).toBe("/leaf_and_root_test");
  });

  it("prefers TEST_DATABASE_URL", () => {
    const url = resolveTestDatabaseUrl({
      DATABASE_URL: "postgresql://u:p@localhost:5434/leaf_and_root",
      TEST_DATABASE_URL: "postgresql://u:p@127.0.0.1:5434/other_test",
    });
    expect(new URL(url).pathname).toBe("/other_test");
  });

  it("refuses databases not named *_test and non-local hosts", () => {
    expect(() =>
      resolveTestDatabaseUrl({ TEST_DATABASE_URL: "postgresql://u:p@localhost/leaf_and_root" }),
    ).toThrow(/_test/);
    expect(() =>
      resolveTestDatabaseUrl({ TEST_DATABASE_URL: "postgresql://u:p@prod.example.com/app_test" }),
    ).toThrow(/non-local/);
  });
});
