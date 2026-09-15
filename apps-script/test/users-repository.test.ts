import { describe, expect, it } from "vitest";
import { UsersRepository } from "../core/users-repository";
import { MemorySheet } from "./helpers";

function seededSheet(): MemorySheet {
  const sheet = new MemorySheet();
  sheet.appendRow([
    "user_id",
    "email",
    "full_name",
    "mobile_number",
    "role",
    "account_status",
    "created_at",
    "updated_at",
  ]);
  return sheet;
}

function seedUser(
  sheet: MemorySheet,
  overrides: Partial<{
    userId: string;
    email: string;
    fullName: string;
    mobileNumber: string;
    role: string;
    accountStatus: string;
  }> = {},
): void {
  sheet.appendRow([
    overrides.userId ?? "user-1",
    overrides.email ?? "user1@example.com",
    overrides.fullName ?? "User One",
    overrides.mobileNumber ?? "09171234567",
    overrides.role ?? "Admin",
    overrides.accountStatus ?? "Active",
    "2026-09-14T00:00:00.000Z",
    "2026-09-14T00:00:00.000Z",
  ]);
}

describe("UsersRepository", () => {
  it("lists users without exposing raw row positions", () => {
    const sheet = seededSheet();
    seedUser(sheet, { userId: "user-1" });
    const repository = new UsersRepository(sheet);
    const list = repository.list();
    expect(list).toEqual([
      {
        userId: "user-1",
        email: "user1@example.com",
        fullName: "User One",
        mobileNumber: "09171234567",
        role: "Admin",
        accountStatus: "Active",
        createdAt: "2026-09-14T00:00:00.000Z",
        updatedAt: "2026-09-14T00:00:00.000Z",
      },
    ]);
    expect(list[0]).not.toHaveProperty("row");
  });

  it("filters by role and accountStatus", () => {
    const sheet = seededSheet();
    seedUser(sheet, { userId: "u1", role: "Admin", accountStatus: "Active" });
    seedUser(sheet, { userId: "u2", role: "Agent", accountStatus: "Active" });
    seedUser(sheet, {
      userId: "u3",
      role: "Agent",
      accountStatus: "Inactive",
    });
    const repository = new UsersRepository(sheet);
    expect(repository.list({ role: "Agent" }).map((u) => u.userId)).toEqual([
      "u2",
      "u3",
    ]);
    expect(
      repository.list({ accountStatus: "Active" }).map((u) => u.userId),
    ).toEqual(["u1", "u2"]);
    expect(
      repository
        .list({ role: "Agent", accountStatus: "Inactive" })
        .map((u) => u.userId),
    ).toEqual(["u3"]);
  });

  it("finds a user by id and returns null when absent", () => {
    const sheet = seededSheet();
    seedUser(sheet, { userId: "user-1" });
    const repository = new UsersRepository(sheet);
    expect(repository.findById("user-1")?.fullName).toBe("User One");
    expect(repository.findById("missing")).toBeNull();
  });

  it("counts active Admins, optionally excluding one userId", () => {
    const sheet = seededSheet();
    seedUser(sheet, { userId: "a1", role: "Admin", accountStatus: "Active" });
    seedUser(sheet, { userId: "a2", role: "Admin", accountStatus: "Active" });
    seedUser(sheet, {
      userId: "a3",
      role: "Admin",
      accountStatus: "Inactive",
    });
    seedUser(sheet, { userId: "g1", role: "Agent", accountStatus: "Active" });
    const repository = new UsersRepository(sheet);
    expect(repository.countActiveAdmins()).toBe(2);
    expect(repository.countActiveAdmins("a1")).toBe(1);
    expect(repository.countActiveAdmins("a2")).toBe(1);
  });

  it("updates only the supplied fields and always refreshes updatedAt", () => {
    const sheet = seededSheet();
    seedUser(sheet, { userId: "user-1" });
    const repository = new UsersRepository(sheet);
    const existing = repository.findById("user-1")!;
    const updated = repository.update(existing, {
      mobileNumber: "09179998888",
      updatedAt: "2026-09-15T00:00:00.000Z",
    });
    expect(updated).toEqual({
      userId: "user-1",
      email: "user1@example.com",
      fullName: "User One",
      mobileNumber: "09179998888",
      role: "Admin",
      accountStatus: "Active",
      createdAt: "2026-09-14T00:00:00.000Z",
      updatedAt: "2026-09-15T00:00:00.000Z",
    });
  });
});
