import { describe, expect, it } from "vitest";
import { ApplicationsRepository } from "../core/applications-repository";
import { MemorySheet } from "./helpers";
import type { ApplicationRecord } from "../core/contracts";

function seededSheet(): MemorySheet {
  const sheet = new MemorySheet();
  sheet.appendRow([
    "application_id",
    "customer_full_name",
    "mobile_number",
    "email",
    "complete_address",
    "barangay",
    "city_municipality",
    "province",
    "landmark",
    "plan_id",
    "plan_name_snapshot",
    "monthly_price_snapshot",
    "agent_id",
    "processor_id",
    "current_status",
    "job_order_number",
    "submitted_at",
    "installed_at",
    "notes",
    "version",
    "created_at",
    "updated_at",
  ]);
  return sheet;
}

function baseRecord(
  overrides: Partial<ApplicationRecord> = {},
): ApplicationRecord {
  return {
    applicationId: "app-1",
    customerFullName: "Juan Dela Cruz",
    mobileNumber: "09171234567",
    email: "",
    completeAddress: "123 Rizal St",
    barangay: "Barangay 1",
    cityMunicipality: "Quezon City",
    province: "Metro Manila",
    landmark: "",
    planId: "plan-1",
    planNameSnapshot: "Fiber 100",
    monthlyPriceSnapshot: 1299,
    agentId: "agent-1",
    processorId: "",
    currentStatus: "Pending",
    jobOrderNumber: "",
    submittedAt: "2026-09-16T00:00:00.000Z",
    installedAt: "",
    notes: "",
    version: 1,
    createdAt: "2026-09-16T00:00:00.000Z",
    updatedAt: "2026-09-16T00:00:00.000Z",
    ...overrides,
  };
}

describe("ApplicationsRepository", () => {
  it("creates and lists applications without exposing raw row positions", () => {
    const sheet = seededSheet();
    const repository = new ApplicationsRepository(sheet);
    repository.create(baseRecord());
    const list = repository.list();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ applicationId: "app-1" });
    expect(list[0]).not.toHaveProperty("row");
  });

  it("filters by agentId, processorId, and currentStatus", () => {
    const sheet = seededSheet();
    const repository = new ApplicationsRepository(sheet);
    repository.create(baseRecord({ applicationId: "a1", agentId: "agent-1" }));
    repository.create(baseRecord({ applicationId: "a2", agentId: "agent-2" }));
    repository.create(
      baseRecord({
        applicationId: "a3",
        agentId: "agent-1",
        processorId: "proc-1",
        currentStatus: "Transmitted",
      }),
    );
    expect(
      repository.list({ agentId: "agent-1" }).map((r) => r.applicationId),
    ).toEqual(["a1", "a3"]);
    expect(
      repository.list({ processorId: "proc-1" }).map((r) => r.applicationId),
    ).toEqual(["a3"]);
    expect(
      repository
        .list({ currentStatus: "Transmitted" })
        .map((r) => r.applicationId),
    ).toEqual(["a3"]);
  });

  it("finds by id and returns null when absent", () => {
    const sheet = seededSheet();
    const repository = new ApplicationsRepository(sheet);
    repository.create(baseRecord());
    expect(repository.findById("app-1")?.customerFullName).toBe(
      "Juan Dela Cruz",
    );
    expect(repository.findById("missing")).toBeNull();
  });

  it("updates only the supplied fields, always sets version/updatedAt", () => {
    const sheet = seededSheet();
    const repository = new ApplicationsRepository(sheet);
    repository.create(baseRecord());
    const existing = repository.findById("app-1")!;
    const updated = repository.update(existing, {
      currentStatus: "Transmitted",
      version: 2,
      updatedAt: "2026-09-17T00:00:00.000Z",
    });
    expect(updated).toMatchObject({
      applicationId: "app-1",
      currentStatus: "Transmitted",
      version: 2,
      customerFullName: "Juan Dela Cruz",
    });
  });
});
