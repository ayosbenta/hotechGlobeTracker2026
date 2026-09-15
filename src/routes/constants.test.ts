import { describe, expect, it } from "vitest";

import {
  APP_ROUTES,
  routeForRole,
  safeDestinationForRole,
} from "@/routes/constants";

describe("routeForRole", () => {
  it("returns the canonical portal route for each role", () => {
    expect(routeForRole("admin")).toBe(APP_ROUTES.adminDashboard);
    expect(routeForRole("agent")).toBe(APP_ROUTES.agentDashboard);
    expect(routeForRole("processor")).toBe(APP_ROUTES.processorDashboard);
  });
});

describe("safeDestinationForRole", () => {
  it("accepts the attempted destination when it is that role's own canonical dashboard", () => {
    expect(safeDestinationForRole(APP_ROUTES.adminDashboard, "admin")).toBe(
      APP_ROUTES.adminDashboard,
    );
    expect(safeDestinationForRole(APP_ROUTES.agentDashboard, "agent")).toBe(
      APP_ROUTES.agentDashboard,
    );
    expect(
      safeDestinationForRole(APP_ROUTES.processorDashboard, "processor"),
    ).toBe(APP_ROUTES.processorDashboard);
  });

  it("falls back to the role's own canonical dashboard when the destination belongs to a different role", () => {
    expect(safeDestinationForRole(APP_ROUTES.adminDashboard, "agent")).toBe(
      APP_ROUTES.agentDashboard,
    );
    expect(safeDestinationForRole(APP_ROUTES.processorDashboard, "admin")).toBe(
      APP_ROUTES.adminDashboard,
    );
  });

  it("rejects any non-canonical path, including short role routes and root", () => {
    expect(safeDestinationForRole("/admin", "admin")).toBe(
      APP_ROUTES.adminDashboard,
    );
    expect(safeDestinationForRole("/", "admin")).toBe(
      APP_ROUTES.adminDashboard,
    );
    expect(safeDestinationForRole("/agent/dashboard/", "agent")).toBe(
      APP_ROUTES.agentDashboard,
    );
  });

  it("rejects an external or protocol-relative URL", () => {
    expect(safeDestinationForRole("https://evil.example.com", "admin")).toBe(
      APP_ROUTES.adminDashboard,
    );
    expect(safeDestinationForRole("//evil.example.com", "admin")).toBe(
      APP_ROUTES.adminDashboard,
    );
  });

  it("rejects a query-controlled or arbitrary string, and non-string values", () => {
    expect(
      safeDestinationForRole("/admin/dashboard?next=/agent/dashboard", "admin"),
    ).toBe(APP_ROUTES.adminDashboard);
    expect(safeDestinationForRole(undefined, "admin")).toBe(
      APP_ROUTES.adminDashboard,
    );
    expect(safeDestinationForRole(null, "admin")).toBe(
      APP_ROUTES.adminDashboard,
    );
    expect(safeDestinationForRole(42, "admin")).toBe(APP_ROUTES.adminDashboard);
    expect(safeDestinationForRole({ from: "/admin/dashboard" }, "admin")).toBe(
      APP_ROUTES.adminDashboard,
    );
  });
});
