import { createHash, timingSafeEqual } from "node:crypto";

import { verifyPassword } from "./password-hash";

/**
 * Single hardcoded Admin login (owner request: Google OAuth removed). Only a
 * salted scrypt hash of the password is stored here, never the plaintext.
 */
export const ADMIN_USERNAME = "ryanzkey";

const ADMIN_PASSWORD_HASH =
  "46XipClm8oBf2lXaNLHvQQ==:o+SvRBf9pw0ksdHn3S4b5HnwT/dM1D3vgSLBp3L1TdV973skfFFuR0zvNasHQaDP2cYqv/YeEu9T7YPf7/lboQ==";
const ADMIN_PASSWORD_PARAMS = JSON.stringify({
  N: 16384,
  r: 8,
  p: 1,
  keyLength: 64,
});

/** Default provider subject bound to the Admin's Users row on first login. */
export const DEFAULT_ADMIN_PROVIDER_SUBJECT = `password:${ADMIN_USERNAME}`;

function digest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

/**
 * Compares the username in constant time and always runs the password hash,
 * so a wrong username and a wrong password take the same time.
 */
export async function verifyAdminCredentials(
  username: string,
  password: string,
): Promise<boolean> {
  const usernameMatches = timingSafeEqual(
    digest(username.trim().toLowerCase()),
    digest(ADMIN_USERNAME),
  );
  const passwordMatches = await verifyPassword(
    password,
    "scrypt",
    ADMIN_PASSWORD_HASH,
    ADMIN_PASSWORD_PARAMS,
  );
  return usernameMatches && passwordMatches;
}
