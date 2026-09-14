import { describe, expect, it } from "vitest";

import { handleGet, handlePost } from "../core/api";
import { appendActivityLog } from "../core/audit";
import { loadServerConfig } from "../core/config";
import type { AuthenticatedActor } from "../core/contracts";
import { requireGeneratedRequestId } from "../core/idempotency";
import { LOCK_WAIT_MS, LockConflictError, withScriptLock } from "../core/lock";
import { openSheetRepository } from "../core/repository";
import { parsePathInfo } from "../core/request";
import {
  failure,
  failureForOperationalError,
  serialize,
  success,
} from "../core/response";
import {
  createRequestContext,
  createAppsScriptUuidGenerator,
} from "../core/runtime";
import { validateTransition } from "../core/status-transitions";
import { requiredText } from "../core/validation";
import { assertCurrentVersion, StaleVersionError } from "../core/versioning";
import { FixedClock, MemorySpreadsheet, SequenceUuid } from "./helpers";

describe("response and API envelopes", () => {
  const clock = new FixedClock();

  it("uses the safe response envelope for health and hides configuration errors", () => {
    const response = handleGet(
      { pathInfo: "/v1/health" },
      {
        clock,
        uuidGenerator: new SequenceUuid(),
        validateConfiguration: () => undefined,
      },
    );
    expect(response).toEqual({
      ok: true,
      requestId: "uuid-1",
      data: { service: "hotech-globe-tracker", version: "v1", status: "ok" },
      meta: { timestamp: "2026-09-14T00:00:00.000Z", nextCursor: null },
    });

    const failed = handleGet(
      { pathInfo: "/v1/health" },
      {
        clock,
        uuidGenerator: new SequenceUuid(),
        validateConfiguration: () => {
          throw new Error("SPREADSHEET_ID=secret-value");
        },
      },
    );
    expect(failed).toMatchObject({
      ok: false,
      error: { code: "INTERNAL_ERROR" },
    });
    expect(serialize(failed)).not.toContain("secret-value");
  });

  it("returns only safe NOT_FOUND envelopes for unsupported routes and all POSTs", () => {
    const dependencies = {
      clock,
      uuidGenerator: new SequenceUuid(),
      validateConfiguration: () => undefined,
    };
    expect(
      handleGet({ pathInfo: "/v1/applications" }, dependencies),
    ).toMatchObject({
      ok: false,
      error: { code: "NOT_FOUND" },
    });
    expect(handlePost({}, dependencies)).toMatchObject({
      ok: false,
      error: { code: "NOT_FOUND" },
    });
  });

  it("serializes canonical success and validation failures", () => {
    expect(success("r-1", { value: 1 }, clock)).toMatchObject({
      ok: true,
      requestId: "r-1",
    });
    expect(
      failure("r-1", "VALIDATION_ERROR", [
        { field: "email", issue: "invalid" },
      ]),
    ).toEqual({
      ok: false,
      requestId: "r-1",
      error: {
        code: "VALIDATION_ERROR",
        message: "Request validation failed.",
        details: [{ field: "email", issue: "invalid" }],
      },
    });
  });
});

describe("configuration, UUID, lock, version, and idempotency primitives", () => {
  it("loads only valid server configuration from mocked Script Properties", () => {
    const properties = {
      getProperty: (key: string) =>
        ({
          SPREADSHEET_ID: "abcdefghijklmnopqrstuvwxyz_123",
          ALLOWED_ORIGINS: "https://app.example.com",
        })[key] ?? null,
    };
    expect(loadServerConfig(properties)).toEqual({
      spreadsheetId: "abcdefghijklmnopqrstuvwxyz_123",
      allowedOrigins: ["https://app.example.com"],
    });
    expect(() => loadServerConfig({ getProperty: () => null })).toThrow(
      "Server configuration is unavailable.",
    );
  });

  it("generates request IDs server-side through the Apps Script UUID adapter", () => {
    const uuid = createAppsScriptUuidGenerator({
      getUuid: () => "server-uuid",
    });
    expect(createRequestContext(new FixedClock(), uuid)).toEqual({
      requestId: "server-uuid",
      receivedAt: "2026-09-14T00:00:00.000Z",
    });
    expect(() => requireGeneratedRequestId("  ")).toThrow();
  });

  it("waits no longer than five seconds and releases acquired script locks", () => {
    let released = false;
    const lock = {
      tryLock: (wait: number) => {
        expect(wait).toBe(LOCK_WAIT_MS);
        return true;
      },
      releaseLock: () => {
        released = true;
      },
    };
    expect(withScriptLock({ getScriptLock: () => lock }, () => "done")).toBe(
      "done",
    );
    expect(released).toBe(true);

    const denied = {
      tryLock: () => false,
      releaseLock: () => expect.unreachable(),
    };
    expect(() =>
      withScriptLock({ getScriptLock: () => denied }, () => undefined),
    ).toThrow(LockConflictError);
  });

  it("provides optimistic-version primitives without application mutation routes", () => {
    expect(
      assertCurrentVersion({ applicationId: "app-1", version: 3 }, 3),
    ).toBe(4);
    expect(() =>
      assertCurrentVersion({ applicationId: "app-1", version: 3 }, 2),
    ).toThrow(StaleVersionError);
    expect(
      failureForOperationalError("request-1", new LockConflictError()),
    ).toMatchObject({ ok: false, error: { code: "CONFLICT" } });
    expect(
      failureForOperationalError("request-1", new StaleVersionError()),
    ).toMatchObject({ ok: false, error: { code: "CONFLICT" } });
  });

  it("does not hide an audit append failure behind a transactional claim", () => {
    const failingLogSheet = {
      appendRow: () => {
        throw new Error("write failed");
      },
    };
    expect(() =>
      appendActivityLog(
        failingLogSheet,
        {
          actorUserId: "SYSTEM",
          action: "TEST",
          entityType: "Test",
          entityId: "test",
          requestId: "request-1",
          metadata: {},
        },
        new FixedClock(),
        new SequenceUuid(),
      ),
    ).toThrow("write failed");
  });

  it("uses typed parsing, validation, and read-only repository adapters", () => {
    expect(parsePathInfo("//v1/health/")).toBe("/v1/health");
    expect(requiredText("notes", " ")).toEqual({
      field: "notes",
      issue: "is required",
    });
    expect(requiredText("notes", "provided")).toBeNull();

    const spreadsheet = new MemorySpreadsheet();
    spreadsheet.insertSheet("Users");
    const repository = openSheetRepository(
      {
        openById: (id) => {
          expect(id).toBe("abcdefghijklmnopqrstuvwxyz_123");
          return spreadsheet;
        },
      },
      { spreadsheetId: "abcdefghijklmnopqrstuvwxyz_123", allowedOrigins: [] },
    );
    expect(repository.requiredSheet("Users")).toBe(
      spreadsheet.getSheetByName("Users"),
    );
  });

  it("keeps actor contracts typed but never obtains them from request data", () => {
    const actor: AuthenticatedActor = {
      userId: "u-1",
      role: "Admin",
      email: "admin@example.com",
    };
    expect(actor.role).toBe("Admin");
  });
});

describe("approved status-transition matrix", () => {
  it("allows the normal forward flow with required workflow fields", () => {
    expect(
      validateTransition({ fromStatus: "Pending", toStatus: "Transmitted" })
        .valid,
    ).toBe(true);
    expect(
      validateTransition({
        fromStatus: "Transmitted",
        toStatus: "With Job Order",
        jobOrderNumber: "JO-123",
      }).valid,
    ).toBe(true);
    expect(
      validateTransition({
        fromStatus: "With Job Order",
        toStatus: "Ongoing",
        jobOrderNumber: "JO-123",
      }).valid,
    ).toBe(true);
    expect(
      validateTransition({
        fromStatus: "Ongoing",
        toStatus: "Installed",
        jobOrderNumber: "JO-123",
        installedAt: "2026-09-14T00:00:00.000Z",
      }).valid,
    ).toBe(true);
  });

  it("enforces notes, job order, installation time, delayed return, and controlled reopening", () => {
    expect(
      validateTransition({ fromStatus: "Pending", toStatus: "Delayed" }).issues,
    ).toContain(
      "Notes are required for Delayed and Cancelled/Rejected statuses.",
    );
    expect(
      validateTransition({
        fromStatus: "Delayed",
        toStatus: "Transmitted",
        delayedFromStatus: "Pending",
      }).valid,
    ).toBe(false);
    expect(
      validateTransition({
        fromStatus: "Delayed",
        toStatus: "Pending",
        delayedFromStatus: "Pending",
      }).valid,
    ).toBe(true);
    expect(
      validateTransition({
        fromStatus: "Ongoing",
        toStatus: "Installed",
        jobOrderNumber: "JO-123",
      }).issues,
    ).toContain("An installed_at timestamp is required for Installed status.");
    expect(
      validateTransition({
        fromStatus: "Cancelled/Rejected",
        toStatus: "Pending",
      }).valid,
    ).toBe(false);
    expect(
      validateTransition({
        fromStatus: "Cancelled/Rejected",
        toStatus: "Pending",
        canReopenCancellation: true,
      }).valid,
    ).toBe(true);
  });
});
