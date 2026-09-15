import { describe, expect, it } from "vitest";

import { environment } from "@/config/env";

describe("environment", () => {
  it("provides the documented default public app name", () => {
    expect(environment.appName).toBe("Hotech Globe Tracker");
  });

  it("leaves googleClientId undefined when VITE_GOOGLE_CLIENT_ID is not set", () => {
    expect(environment.googleClientId).toBeUndefined();
  });
});
