import { describe, expect, it } from "vitest";

import { APP_ROUTES, routeForRole } from "@/routes/constants";

describe("routeForRole", () => {
  it("returns the canonical portal route for each role", () => {
    expect(routeForRole("admin")).toBe(APP_ROUTES.admin);
    expect(routeForRole("agent")).toBe(APP_ROUTES.agent);
    expect(routeForRole("processor")).toBe(APP_ROUTES.processor);
  });
});
