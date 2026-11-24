import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import pg from "pg";
import { databaseName, resolveTestDatabaseUrl } from "./test-database.js";

/** Creates the isolated test database if needed and applies every committed migration to it. */
export default async function setup(): Promise<void> {
  const url = resolveTestDatabaseUrl();
  const name = databaseName(url); // validated by resolveTestDatabaseUrl: [a-z0-9_]+_test

  const admin = new URL(url);
  admin.pathname = "/postgres";
  const client = new pg.Client({ connectionString: admin.toString() });
  await client.connect();
  try {
    const existing = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [name]);
    if (existing.rowCount === 0) await client.query(`CREATE DATABASE "${name}"`);
  } finally {
    await client.end();
  }

  execFileSync(process.execPath, [resolve("node_modules/prisma/build/index.js"), "migrate", "deploy"], {
    env: { ...process.env, DATABASE_URL: url },
    stdio: "pipe",
  });
}
