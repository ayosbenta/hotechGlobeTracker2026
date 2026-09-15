import { describe, expect, it } from "vitest";

import { originIsAllowed } from "../auth/origin-check";

const APP_ORIGIN = "https://app.example.com";

describe("origin-check (defense-in-depth only)", () => {
  it("allows a request with no Origin header", () => {
    expect(originIsAllowed(undefined, APP_ORIGIN)).toBe(true);
  });

  it("allows a matching Origin header", () => {
    expect(originIsAllowed(APP_ORIGIN, APP_ORIGIN)).toBe(true);
  });

  it("denies a mismatched Origin header", () => {
    expect(originIsAllowed("https://evil.example.com", APP_ORIGIN)).toBe(false);
  });

  it("uses the first value when the header is duplicated", () => {
    expect(
      originIsAllowed([APP_ORIGIN, "https://evil.example.com"], APP_ORIGIN),
    ).toBe(true);
    expect(
      originIsAllowed(["https://evil.example.com", APP_ORIGIN], APP_ORIGIN),
    ).toBe(false);
  });
});
