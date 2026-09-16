import { afterEach, describe, expect, it, vi } from "vitest";

import { environment } from "@/config/env";

async function importEnvironmentWith(
  name: string,
  value: string,
): Promise<typeof environment> {
  vi.stubEnv(name, value);
  vi.resetModules();
  const module = await import("@/config/env");
  return module.environment;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("environment", () => {
  it("provides the documented default public app name", () => {
    expect(environment.appName).toBe("Hotech Globe Tracker");
  });

  it("falls back to the default app name when VITE_APP_NAME is empty", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const env = await importEnvironmentWith("VITE_APP_NAME", "");

    expect(env.appName).toBe("Hotech Globe Tracker");
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("trims and keeps a real VITE_APP_NAME", async () => {
    const env = await importEnvironmentWith("VITE_APP_NAME", "  Hotech  ");

    expect(env.appName).toBe("Hotech");
  });
});
