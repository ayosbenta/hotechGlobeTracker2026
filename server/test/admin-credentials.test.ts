import { describe, expect, it } from "vitest";

import { verifyAdminCredentials } from "../auth/admin-credentials";

// The real admin password is never committed. Export ADMIN_TEST_PASSWORD
// locally to exercise the positive path against the stored hash.
const realPassword = process.env.ADMIN_TEST_PASSWORD;

describe("verifyAdminCredentials", () => {
  it.skipIf(!realPassword)(
    "accepts the hardcoded admin username and password",
    async () => {
      expect(await verifyAdminCredentials("ryanzkey", realPassword!)).toBe(
        true,
      );
    },
  );

  it.skipIf(!realPassword)(
    "treats the username case-insensitively and trims it",
    async () => {
      expect(await verifyAdminCredentials("  RyanZkey ", realPassword!)).toBe(
        true,
      );
    },
  );

  it.skipIf(!realPassword)("rejects a wrong username", async () => {
    expect(await verifyAdminCredentials("admin", realPassword!)).toBe(false);
  });

  it("rejects a wrong password", async () => {
    expect(await verifyAdminCredentials("ryanzkey", "not-the-password")).toBe(
      false,
    );
  });

  it("rejects an empty password", async () => {
    expect(await verifyAdminCredentials("ryanzkey", "")).toBe(false);
  });
});
