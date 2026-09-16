import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

/**
 * Password hashing/verification core for the D-049/D-050 password-auth
 * migration. Runs only in the Node BFF — Apps Script V8 has no Argon2/scrypt
 * primitive (PASSWORD_AUTH_IMPACT_PLAN.md §3) and never computes or compares
 * a password hash; it only stores what this module produces.
 */

export type PasswordAlgo = "argon2id" | "scrypt";

export interface PasswordHashResult {
  algo: PasswordAlgo;
  hash: string;
  params: string;
}

const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1, keyLength: 64 } as const;

let argon2Module: typeof import("@node-rs/argon2") | null | undefined;

async function loadArgon2(): Promise<typeof import("@node-rs/argon2") | null> {
  if (argon2Module !== undefined) return argon2Module;
  try {
    argon2Module = await import("@node-rs/argon2");
  } catch {
    argon2Module = null;
  }
  return argon2Module;
}

function hashScrypt(password: string): PasswordHashResult {
  const salt = randomBytes(16);
  const derived = scryptSync(password, salt, SCRYPT_PARAMS.keyLength, {
    N: SCRYPT_PARAMS.N,
    r: SCRYPT_PARAMS.r,
    p: SCRYPT_PARAMS.p,
  });
  return {
    algo: "scrypt",
    hash: `${salt.toString("base64")}:${derived.toString("base64")}`,
    params: JSON.stringify(SCRYPT_PARAMS),
  };
}

function verifyScrypt(password: string, hash: string, params: string): boolean {
  const [saltB64, derivedB64] = hash.split(":");
  if (!saltB64 || !derivedB64) return false;
  const parsed = JSON.parse(params) as {
    N: number;
    r: number;
    p: number;
    keyLength: number;
  };
  const salt = Buffer.from(saltB64, "base64");
  const expected = Buffer.from(derivedB64, "base64");
  const actual = scryptSync(password, salt, parsed.keyLength, {
    N: parsed.N,
    r: parsed.r,
    p: parsed.p,
  });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/**
 * Hashes a plaintext password. Prefers Argon2id; falls back to scrypt only if
 * the native @node-rs/argon2 binding fails to load (e.g. an unsupported
 * runtime) — the fallback documented and pre-approved in D-050, not a silent
 * substitution.
 */
export async function hashPassword(
  password: string,
): Promise<PasswordHashResult> {
  const argon2 = await loadArgon2();
  if (argon2 === null) return hashScrypt(password);

  // Numeric literal, not the `Algorithm.Argon2id` const-enum member: that
  // member can't be accessed through a dynamically-imported module type
  // under `isolatedModules` (TS2748). `2` is Argon2id's value in
  // @node-rs/argon2's Algorithm enum (0 = Argon2d, 1 = Argon2i, 2 = Argon2id).
  const hash = await argon2.hash(password, { algorithm: 2 });
  return { algo: "argon2id", hash, params: "" };
}

/**
 * Verifies a plaintext password against a stored hash using the algorithm
 * and parameters recorded on that row (Credentials.password_algo/
 * password_algo_params), never the caller's current default — so a future
 * parameter change never invalidates already-hashed passwords (§2/§3).
 */
export async function verifyPassword(
  password: string,
  algo: PasswordAlgo,
  hash: string,
  params: string,
): Promise<boolean> {
  if (algo === "scrypt") return verifyScrypt(password, hash, params);

  const argon2 = await loadArgon2();
  if (argon2 === null) {
    throw new Error(
      "Cannot verify an argon2id hash: the @node-rs/argon2 native binding is unavailable.",
    );
  }
  return argon2.verify(hash, password);
}
