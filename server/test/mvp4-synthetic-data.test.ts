import { describe, expect, it } from "vitest";

import {
  MVP4_SYNTHETIC_PREFIX,
  buildSyntheticApplicationPayload,
  buildSyntheticPlanPayload,
  isMvp4SyntheticApplication,
  isMvp4SyntheticName,
  isMvp4SyntheticPlan,
  selectMvp4SyntheticApplications,
  selectMvp4SyntheticPlans,
} from "../acceptance/mvp4-synthetic-data";

describe("MVP-4 synthetic test-data helpers", () => {
  it("builds a synthetic plan payload prefixed with the exact marker", () => {
    const plan = buildSyntheticPlanPayload("abc");
    expect(plan.planName.startsWith(MVP4_SYNTHETIC_PREFIX)).toBe(true);
    expect(plan.planName).toBe(`${MVP4_SYNTHETIC_PREFIX}plan-abc`);
    expect(plan.monthlyPrice).toBeGreaterThan(0);
    expect(plan.speedMbps).toBeGreaterThan(0);
  });

  it("builds a synthetic application payload prefixed with the exact marker on every text field", () => {
    const app = buildSyntheticApplicationPayload("xyz", "plan-1");
    expect(app.customerFullName.startsWith(MVP4_SYNTHETIC_PREFIX)).toBe(true);
    expect(app.completeAddress.startsWith(MVP4_SYNTHETIC_PREFIX)).toBe(true);
    expect(app.barangay.startsWith(MVP4_SYNTHETIC_PREFIX)).toBe(true);
    expect(app.cityMunicipality.startsWith(MVP4_SYNTHETIC_PREFIX)).toBe(true);
    expect(app.province.startsWith(MVP4_SYNTHETIC_PREFIX)).toBe(true);
    expect(app.notes.startsWith(MVP4_SYNTHETIC_PREFIX)).toBe(true);
    expect(app.planId).toBe("plan-1");
  });

  it("isMvp4SyntheticName matches only an exact prefix, not a substring elsewhere", () => {
    expect(isMvp4SyntheticName(`${MVP4_SYNTHETIC_PREFIX}anything`)).toBe(true);
    expect(isMvp4SyntheticName(`prefix-${MVP4_SYNTHETIC_PREFIX}anything`)).toBe(
      false,
    );
    expect(isMvp4SyntheticName("a real customer name")).toBe(false);
  });

  it("isMvp4SyntheticApplication never flags a real (non-prefixed) row", () => {
    expect(
      isMvp4SyntheticApplication({
        applicationId: "a1",
        customerFullName: "Maria Santos",
      }),
    ).toBe(false);
    expect(
      isMvp4SyntheticApplication({
        applicationId: "a2",
        customerFullName: `${MVP4_SYNTHETIC_PREFIX}customer-1`,
      }),
    ).toBe(true);
  });

  it("isMvp4SyntheticPlan never flags a real (non-prefixed) row", () => {
    expect(
      isMvp4SyntheticPlan({ planId: "p1", planName: "GFiber Unli 1299" }),
    ).toBe(false);
    expect(
      isMvp4SyntheticPlan({
        planId: "p2",
        planName: `${MVP4_SYNTHETIC_PREFIX}plan-1`,
      }),
    ).toBe(true);
  });

  it("selectMvp4SyntheticApplications filters a mixed list down to only synthetic rows", () => {
    const records = [
      { applicationId: "a1", customerFullName: "Real Customer" },
      {
        applicationId: "a2",
        customerFullName: `${MVP4_SYNTHETIC_PREFIX}customer-1`,
      },
      {
        applicationId: "a3",
        customerFullName: `${MVP4_SYNTHETIC_PREFIX}customer-2`,
      },
    ];
    const selected = selectMvp4SyntheticApplications(records);
    expect(selected.map((r) => r.applicationId)).toEqual(["a2", "a3"]);
  });

  it("selectMvp4SyntheticPlans filters a mixed list down to only synthetic rows", () => {
    const records = [
      { planId: "p1", planName: "Real Plan" },
      { planId: "p2", planName: `${MVP4_SYNTHETIC_PREFIX}plan-1` },
    ];
    const selected = selectMvp4SyntheticPlans(records);
    expect(selected.map((r) => r.planId)).toEqual(["p2"]);
  });

  it("returns an empty selection (not an error) when nothing is synthetic", () => {
    expect(
      selectMvp4SyntheticApplications([
        { applicationId: "a1", customerFullName: "Real Customer" },
      ]),
    ).toEqual([]);
    expect(
      selectMvp4SyntheticPlans([{ planId: "p1", planName: "Real Plan" }]),
    ).toEqual([]);
  });
});
