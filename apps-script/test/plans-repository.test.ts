import { describe, expect, it } from "vitest";
import { PlansRepository } from "../core/plans-repository";
import { MemorySheet } from "./helpers";

function seededSheet(): MemorySheet {
  const sheet = new MemorySheet();
  sheet.appendRow([
    "plan_id",
    "plan_name",
    "monthly_price",
    "speed_mbps",
    "plan_status",
    "created_at",
    "updated_at",
  ]);
  return sheet;
}

describe("PlansRepository", () => {
  it("lists plans without exposing raw row positions", () => {
    const sheet = seededSheet();
    const repository = new PlansRepository(sheet);
    repository.create({
      planId: "plan-1",
      planName: "Fiber 100",
      monthlyPrice: 1299,
      speedMbps: 100,
      planStatus: "Active",
      createdAt: "2026-09-14T00:00:00.000Z",
      updatedAt: "2026-09-14T00:00:00.000Z",
    });
    const list = repository.list();
    expect(list).toEqual([
      {
        planId: "plan-1",
        planName: "Fiber 100",
        monthlyPrice: 1299,
        speedMbps: 100,
        planStatus: "Active",
        createdAt: "2026-09-14T00:00:00.000Z",
        updatedAt: "2026-09-14T00:00:00.000Z",
      },
    ]);
    expect(list[0]).not.toHaveProperty("row");
  });

  it("finds a plan by id and returns null when absent", () => {
    const sheet = seededSheet();
    const repository = new PlansRepository(sheet);
    repository.create({
      planId: "plan-1",
      planName: "Fiber 100",
      monthlyPrice: 1299,
      speedMbps: 100,
      planStatus: "Active",
      createdAt: "2026-09-14T00:00:00.000Z",
      updatedAt: "2026-09-14T00:00:00.000Z",
    });
    expect(repository.findById("plan-1")?.planName).toBe("Fiber 100");
    expect(repository.findById("missing")).toBeNull();
  });

  it("updates only the supplied fields and always refreshes updatedAt", () => {
    const sheet = seededSheet();
    const repository = new PlansRepository(sheet);
    repository.create({
      planId: "plan-1",
      planName: "Fiber 100",
      monthlyPrice: 1299,
      speedMbps: 100,
      planStatus: "Active",
      createdAt: "2026-09-14T00:00:00.000Z",
      updatedAt: "2026-09-14T00:00:00.000Z",
    });
    const existing = repository.findById("plan-1")!;
    const updated = repository.update(existing, {
      monthlyPrice: 1399,
      updatedAt: "2026-09-15T00:00:00.000Z",
    });
    expect(updated).toEqual({
      planId: "plan-1",
      planName: "Fiber 100",
      monthlyPrice: 1399,
      speedMbps: 100,
      planStatus: "Active",
      createdAt: "2026-09-14T00:00:00.000Z",
      updatedAt: "2026-09-15T00:00:00.000Z",
    });
  });
});
