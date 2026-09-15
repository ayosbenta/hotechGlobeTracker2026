import { describe, expect, it } from "vitest";

import { isPermittedGoogleAccountDomain } from "../auth/google-verifier";

describe("Google account domain policy", () => {
  it("permits verified gmail.com identities", () => {
    expect(
      isPermittedGoogleAccountDomain({
        sub: "1",
        email: "user@gmail.com",
        emailVerified: true,
        hostedDomain: null,
        nonce: "n",
      }),
    ).toBe(true);
  });

  it("permits Workspace identities with hd present", () => {
    expect(
      isPermittedGoogleAccountDomain({
        sub: "1",
        email: "user@company.com",
        emailVerified: true,
        hostedDomain: "company.com",
        nonce: "n",
      }),
    ).toBe(true);
  });

  it("denies a third-party-domain account with no hd claim", () => {
    expect(
      isPermittedGoogleAccountDomain({
        sub: "1",
        email: "user@notgoogle-hosted.example",
        emailVerified: true,
        hostedDomain: null,
        nonce: "n",
      }),
    ).toBe(false);
  });

  it("denies a malformed email with no domain", () => {
    expect(
      isPermittedGoogleAccountDomain({
        sub: "1",
        email: "not-an-email",
        emailVerified: true,
        hostedDomain: null,
        nonce: "n",
      }),
    ).toBe(false);
  });
});
