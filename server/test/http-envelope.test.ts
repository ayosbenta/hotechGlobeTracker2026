import { describe, expect, it } from "vitest";

import {
  BFF_STATUS_BY_CODE,
  bffFailure,
  bffSuccess,
} from "../auth/http-envelope";

describe("BFF status/error mapping", () => {
  it("maps every documented error code to its exact status", () => {
    expect(BFF_STATUS_BY_CODE.VALIDATION_ERROR).toBe(400);
    expect(BFF_STATUS_BY_CODE.AUTH_REQUIRED).toBe(401);
    expect(BFF_STATUS_BY_CODE.SESSION_EXPIRED).toBe(401);
    expect(BFF_STATUS_BY_CODE.ACCOUNT_INACTIVE).toBe(403);
    expect(BFF_STATUS_BY_CODE.ACCOUNT_LOCKED).toBe(403);
    expect(BFF_STATUS_BY_CODE.FORBIDDEN).toBe(403);
    expect(BFF_STATUS_BY_CODE.NOT_FOUND).toBe(404);
    expect(BFF_STATUS_BY_CODE.REPLAY_OR_CONFLICT).toBe(409);
    expect(BFF_STATUS_BY_CODE.RATE_LIMITED).toBe(429);
    expect(BFF_STATUS_BY_CODE.UPSTREAM_UNAVAILABLE).toBe(502);
    expect(BFF_STATUS_BY_CODE.AUTH_SERVICE_UNAVAILABLE).toBe(503);
    expect(BFF_STATUS_BY_CODE.INTERNAL_ERROR).toBe(500);
  });

  it("success envelope shape matches { ok, requestId, data }", () => {
    const envelope = bffSuccess("req-1", { hello: "world" });
    expect(envelope).toEqual({
      ok: true,
      requestId: "req-1",
      data: { hello: "world" },
    });
  });

  it("failure envelope never includes a stack trace or raw error", () => {
    const envelope = bffFailure("req-1", "INTERNAL_ERROR");
    expect(envelope).toEqual({
      ok: false,
      requestId: "req-1",
      error: {
        code: "INTERNAL_ERROR",
        message: "An internal server error occurred.",
      },
    });
  });

  it("failure messages are generic and never disclose account existence", () => {
    const message = bffFailure("req-1", "ACCOUNT_INACTIVE").error.message;
    expect(message.toLowerCase()).not.toContain("email");
    expect(message.toLowerCase()).not.toContain("user id");
  });
});
