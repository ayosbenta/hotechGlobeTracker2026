import { describe, expect, it } from "vitest";

import { roleFromServerValue } from "./role-mapping";

describe("roleFromServerValue", () => {
  it("maps each recognized capitalized server role to the lowercase Role type", () => {
    expect(roleFromServerValue("Admin")).toBe("admin");
    expect(roleFromServerValue("Agent")).toBe("agent");
    expect(roleFromServerValue("Processor")).toBe("processor");
  });

  it("returns undefined for any unrecognized value instead of guessing", () => {
    expect(roleFromServerValue("admin")).toBeUndefined();
    expect(roleFromServerValue("SuperAdmin")).toBeUndefined();
    expect(roleFromServerValue("")).toBeUndefined();
    expect(roleFromServerValue("__proto__")).toBeUndefined();
  });
});
