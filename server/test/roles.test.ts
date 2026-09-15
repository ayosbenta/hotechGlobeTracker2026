import { describe, expect, it } from "vitest";

import { roleRedirectFor } from "../auth/roles";

describe("role redirects", () => {
  it("resolves each supported role to its canonical dashboard", () => {
    expect(roleRedirectFor("Admin")).toBe("/admin/dashboard");
    expect(roleRedirectFor("Agent")).toBe("/agent/dashboard");
    expect(roleRedirectFor("Processor")).toBe("/processor/dashboard");
  });

  it("returns undefined for an unknown or missing role", () => {
    expect(roleRedirectFor("Superuser")).toBeUndefined();
    expect(roleRedirectFor(undefined)).toBeUndefined();
  });
});
