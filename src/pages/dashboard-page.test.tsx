import { describe, expect, it } from "vitest";

import { resolveDashboardState } from "@/lib/dashboard-state";

describe("resolveDashboardState", () => {
  it("defaults unknown preview values to the populated dashboard", () => {
    expect(resolveDashboardState(null)).toBe("populated");
    expect(resolveDashboardState("unknown")).toBe("populated");
  });

  it("accepts each safe dashboard preview state", () => {
    expect(resolveDashboardState("loading")).toBe("loading");
    expect(resolveDashboardState("empty")).toBe("empty");
    expect(resolveDashboardState("error")).toBe("error");
  });
});
