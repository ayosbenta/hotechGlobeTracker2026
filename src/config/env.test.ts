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

  it("leaves googleClientId undefined when VITE_GOOGLE_CLIENT_ID is not set", () => {
    expect(environment.googleClientId).toBeUndefined();
  });

  it("treats a defined-but-empty VITE_GOOGLE_CLIENT_ID as not set", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const env = await importEnvironmentWith("VITE_GOOGLE_CLIENT_ID", "");

    expect(env.googleClientId).toBeUndefined();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("treats a whitespace-only VITE_GOOGLE_CLIENT_ID as not set", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const env = await importEnvironmentWith("VITE_GOOGLE_CLIENT_ID", "   ");

    expect(env.googleClientId).toBeUndefined();
    warn.mockRestore();
  });

  it("falls back to the default app name when VITE_APP_NAME is empty", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const env = await importEnvironmentWith("VITE_APP_NAME", "");

    expect(env.appName).toBe("Hotech Globe Tracker");
    warn.mockRestore();
  });

  it("trims and keeps a real VITE_GOOGLE_CLIENT_ID", async () => {
    const env = await importEnvironmentWith(
      "VITE_GOOGLE_CLIENT_ID",
      "  123.apps.googleusercontent.com  ",
    );

    expect(env.googleClientId).toBe("123.apps.googleusercontent.com");
  });
});
