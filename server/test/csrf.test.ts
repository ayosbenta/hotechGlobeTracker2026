import { describe, expect, it } from "vitest";

import { CSRF_COOKIE_NAME } from "../auth/cookies";
import { verifyCsrfDoubleSubmit } from "../auth/csrf";

describe("CSRF double-submit verification", () => {
  it("succeeds when cookie and header match", () => {
    const token = verifyCsrfDoubleSubmit({
      cookieHeader: `${CSRF_COOKIE_NAME}=abc123`,
      headerValue: "abc123",
    });
    expect(token).toBe("abc123");
  });

  it("fails when the header is missing", () => {
    expect(
      verifyCsrfDoubleSubmit({
        cookieHeader: `${CSRF_COOKIE_NAME}=abc123`,
        headerValue: undefined,
      }),
    ).toBeNull();
  });

  it("fails when the cookie is missing", () => {
    expect(
      verifyCsrfDoubleSubmit({ cookieHeader: null, headerValue: "abc123" }),
    ).toBeNull();
  });

  it("fails when cookie and header mismatch", () => {
    expect(
      verifyCsrfDoubleSubmit({
        cookieHeader: `${CSRF_COOKIE_NAME}=abc123`,
        headerValue: "different",
      }),
    ).toBeNull();
  });
});
