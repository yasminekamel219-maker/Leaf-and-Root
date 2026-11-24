import "dotenv/config";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/**
 * Integration tests must never touch the development database. The test database is either
 * `TEST_DATABASE_URL` or the development URL with `_test` appended to the database name, and we
 * refuse anything that is not local or not clearly named as a test database.
 */
export function resolveTestDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = env.TEST_DATABASE_URL;
  const base = explicit ?? env.DATABASE_URL;
  if (!base) throw new Error("Set DATABASE_URL (or TEST_DATABASE_URL) to run integration tests.");

  const url = new URL(base);
  if (!explicit) url.pathname = `${url.pathname}_test`;
  url.searchParams.delete("schema");

  const name = url.pathname.slice(1);
  if (!/^[a-z0-9_]+_test$/.test(name)) {
    throw new Error(`Refusing to run tests: database name "${name}" must match [a-z0-9_]+_test.`);
  }
  if (!LOCAL_HOSTS.has(url.hostname)) {
    throw new Error(`Refusing to run tests against non-local host "${url.hostname}".`);
  }
  return url.toString();
}

export function databaseName(url: string): string {
  return new URL(url).pathname.slice(1);
}
