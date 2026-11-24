import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

const KEY_LENGTH = 64;

export type ScryptParams = { N: number; r: number; p: number };

/**
 * Target cost: one of the equivalent-strength scrypt settings in the OWASP Password Storage Cheat
 * Sheet (N=2^16, r=8, p=2 -> about 64 MiB per hash). Hashes are self-describing, so raising this
 * later never invalidates stored hashes: they verify with their own parameters and are upgraded on
 * the next successful login (see needsRehash).
 */
export const CURRENT_PARAMS: ScryptParams = { N: 65_536, r: 8, p: 2 };

/** Upper bounds when verifying, so a corrupted or hostile stored value cannot exhaust memory. */
const MAX_N = 2 ** 17;
const MAX_R = 16;
const MAX_P = 16;
const MAX_MEMORY = 256 * 1024 * 1024;

function deriveKey(password: string, salt: Buffer, params: ScryptParams): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      password,
      salt,
      KEY_LENGTH,
      { ...params, maxmem: MAX_MEMORY },
      (error, key) => (error ? reject(error) : resolve(key)),
    );
  });
}

function encode(params: ScryptParams, salt: Buffer, key: Buffer): string {
  return [
    "scrypt",
    params.N,
    params.r,
    params.p,
    salt.toString("base64url"),
    key.toString("base64url"),
  ].join("$");
}

export async function hashPassword(
  password: string,
  params: ScryptParams = CURRENT_PARAMS,
): Promise<string> {
  const salt = randomBytes(16);
  return encode(params, salt, await deriveKey(password, salt, params));
}

function parseParams(
  n: string | undefined,
  r: string | undefined,
  p: string | undefined,
): ScryptParams | undefined {
  const params = { N: Number(n), r: Number(r), p: Number(p) };
  const isPowerOfTwo =
    Number.isInteger(params.N) && params.N >= 2 && (params.N & (params.N - 1)) === 0;
  const valid =
    isPowerOfTwo &&
    params.N <= MAX_N &&
    Number.isInteger(params.r) &&
    params.r >= 1 &&
    params.r <= MAX_R &&
    Number.isInteger(params.p) &&
    params.p >= 1 &&
    params.p <= MAX_P &&
    128 * params.N * params.r <= MAX_MEMORY;
  return valid ? params : undefined;
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const [algorithm, n, r, p, encodedSalt, encodedKey] = storedHash.split("$");
  const params = parseParams(n, r, p);
  if (algorithm !== "scrypt" || !params || !encodedSalt || !encodedKey) return false;

  try {
    const expected = Buffer.from(encodedKey, "base64url");
    if (expected.length !== KEY_LENGTH) return false;
    const actual = await deriveKey(password, Buffer.from(encodedSalt, "base64url"), params);
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

/** True when a stored hash uses weaker parameters than CURRENT_PARAMS and should be re-created. */
export function needsRehash(storedHash: string): boolean {
  const [algorithm, n, r, p] = storedHash.split("$");
  const params = parseParams(n, r, p);
  if (algorithm !== "scrypt" || !params) return true;
  return (
    params.N < CURRENT_PARAMS.N || params.r < CURRENT_PARAMS.r || params.p < CURRENT_PARAMS.p
  );
}
