import { describe, expect, it } from "vitest";

import { handlePost, type PostDependencies } from "../core/api";
import { AuthDenied } from "../core/auth-domain";
import { EnvelopeError } from "../core/auth-envelope";
import { ConfigurationError } from "../core/config";
import { LockConflictError } from "../core/lock";
import {
  CrudConflictError,
  CrudForbiddenError,
  CrudNotFoundError,
  CrudValidationError,
} from "../core/crud-domain";
import { FixedClock, SequenceUuid } from "./helpers";

const PATH = "/v1/internal/crud";

function deps(
  internalCrud?: PostDependencies["internalCrud"],
): PostDependencies {
  return {
    clock: new FixedClock(),
    uuidGenerator: new SequenceUuid(),
    internalCrud,
  };
}

function jsonBody(value: unknown): { type: string; contents: string } {
  return { type: "application/json", contents: JSON.stringify(value) };
}

const validOuter = {
  operation: "plans_list" as const,
  envelope: { session_token: "x".repeat(43) },
};

describe("MVP-2A internal-CRUD ingress", () => {
  it("dispatches an allowed operation and returns a success envelope with pagination meta", () => {
    let received: unknown;
    const response = handlePost(
      { pathInfo: PATH, postData: jsonBody(validOuter) },
      deps((operation, envelope) => {
        received = { operation, envelope };
        return { data: [{ planId: "p1" }], nextCursor: "25" };
      }),
    );
    expect(received).toEqual({
      operation: "plans_list",
      envelope: validOuter.envelope,
    });
    expect(response).toMatchObject({
      ok: true,
      data: [{ planId: "p1" }],
      meta: { nextCursor: "25" },
    });
  });

  it("falls through to the frozen NOT_FOUND behavior for any other path", () => {
    const response = handlePost(
      { pathInfo: "/v1/other", postData: jsonBody(validOuter) },
      deps(() => ({ data: null, nextCursor: null })),
    );
    expect(response).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
  });

  it("stays NOT_FOUND when internalCrud is not wired, even for a well-formed request", () => {
    const response = handlePost(
      { pathInfo: PATH, postData: jsonBody(validOuter) },
      deps(undefined),
    );
    expect(response).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
  });

  it("rejects a request with missing postData", () => {
    const response = handlePost(
      { pathInfo: PATH },
      deps(() => ({ data: null, nextCursor: null })),
    );
    expect(response).toMatchObject({
      ok: false,
      error: { code: "VALIDATION_ERROR" },
    });
  });

  it("accepts application/json with a charset parameter", () => {
    const response = handlePost(
      {
        pathInfo: PATH,
        postData: {
          type: "application/json; charset=utf-8",
          contents: JSON.stringify(validOuter),
        },
      },
      deps(() => ({ data: null, nextCursor: null })),
    );
    expect(response).toMatchObject({ ok: true });
  });

  it("rejects an unsupported content type", () => {
    const response = handlePost(
      {
        pathInfo: PATH,
        postData: { type: "text/plain", contents: JSON.stringify(validOuter) },
      },
      deps(() => ({ data: null, nextCursor: null })),
    );
    expect(response).toMatchObject({
      ok: false,
      error: { code: "VALIDATION_ERROR" },
    });
  });

  it("rejects malformed JSON", () => {
    const response = handlePost(
      { pathInfo: PATH, postData: { type: "application/json", contents: "{" } },
      deps(() => ({ data: null, nextCursor: null })),
    );
    expect(response).toMatchObject({
      ok: false,
      error: { code: "VALIDATION_ERROR" },
    });
  });

  it("rejects a missing outer key", () => {
    const response = handlePost(
      { pathInfo: PATH, postData: jsonBody({ operation: "plans_list" }) },
      deps(() => ({ data: null, nextCursor: null })),
    );
    expect(response).toMatchObject({
      ok: false,
      error: { code: "VALIDATION_ERROR" },
    });
  });

  it("rejects an extra outer key", () => {
    const response = handlePost(
      { pathInfo: PATH, postData: jsonBody({ ...validOuter, extra: true }) },
      deps(() => ({ data: null, nextCursor: null })),
    );
    expect(response).toMatchObject({
      ok: false,
      error: { code: "VALIDATION_ERROR" },
    });
  });

  it("rejects a non-object envelope", () => {
    const response = handlePost(
      {
        pathInfo: PATH,
        postData: jsonBody({
          operation: "plans_list",
          envelope: "not-an-object",
        }),
      },
      deps(() => ({ data: null, nextCursor: null })),
    );
    expect(response).toMatchObject({
      ok: false,
      error: { code: "VALIDATION_ERROR" },
    });
  });

  const disallowed = [
    "plans_delete",
    "applications_list",
    "users_list",
    "login_first_bind",
    "bootstrapSchema",
  ];
  for (const operation of disallowed) {
    it(`rejects the disallowed/unknown operation "${operation}" before any dispatch`, () => {
      let dispatched = false;
      const response = handlePost(
        { pathInfo: PATH, postData: jsonBody({ operation, envelope: {} }) },
        deps(() => {
          dispatched = true;
          return { data: null, nextCursor: null };
        }),
      );
      expect(dispatched).toBe(false);
      expect(response).toMatchObject({
        ok: false,
        error: { code: "AUTH_DENIED" },
      });
    });
  }

  it("accepts a body at exactly the 16 KiB UTF-8 boundary", () => {
    const filler = "a".repeat(16 * 1024 - 70);
    const outer = {
      operation: "plans_list" as const,
      envelope: { padding: filler },
    };
    const contents = JSON.stringify(outer);
    expect(Buffer.byteLength(contents, "utf8")).toBeLessThanOrEqual(16 * 1024);
    const response = handlePost(
      { pathInfo: PATH, postData: { type: "application/json", contents } },
      deps(() => ({ data: null, nextCursor: null })),
    );
    expect(response).toMatchObject({ ok: true });
  });

  it("rejects a body one byte over the 16 KiB UTF-8 boundary using multi-byte characters", () => {
    const filler = "é".repeat(9000);
    const outer = {
      operation: "plans_list" as const,
      envelope: { padding: filler },
    };
    const contents = JSON.stringify(outer);
    expect(Buffer.byteLength(contents, "utf8")).toBeGreaterThan(16 * 1024);
    const response = handlePost(
      { pathInfo: PATH, postData: { type: "application/json", contents } },
      deps(() => ({ data: null, nextCursor: null })),
    );
    expect(response).toMatchObject({
      ok: false,
      error: { code: "VALIDATION_ERROR" },
    });
  });

  it("classifies AuthDenied and EnvelopeError from the dispatcher as AUTH_DENIED", () => {
    for (const error of [new AuthDenied(), new EnvelopeError()]) {
      const response = handlePost(
        { pathInfo: PATH, postData: jsonBody(validOuter) },
        deps(() => {
          throw error;
        }),
      );
      expect(response).toMatchObject({
        ok: false,
        error: { code: "AUTH_DENIED" },
      });
    }
  });

  it("classifies CrudValidationError as VALIDATION_ERROR", () => {
    const response = handlePost(
      { pathInfo: PATH, postData: jsonBody(validOuter) },
      deps(() => {
        throw new CrudValidationError();
      }),
    );
    expect(response).toMatchObject({
      ok: false,
      error: { code: "VALIDATION_ERROR" },
    });
  });

  it("classifies CrudForbiddenError as FORBIDDEN", () => {
    const response = handlePost(
      { pathInfo: PATH, postData: jsonBody(validOuter) },
      deps(() => {
        throw new CrudForbiddenError();
      }),
    );
    expect(response).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
  });

  it("classifies CrudNotFoundError as NOT_FOUND", () => {
    const response = handlePost(
      { pathInfo: PATH, postData: jsonBody(validOuter) },
      deps(() => {
        throw new CrudNotFoundError();
      }),
    );
    expect(response).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
  });

  it("classifies CrudConflictError and a lock conflict as CONFLICT", () => {
    for (const error of [new CrudConflictError(), new LockConflictError()]) {
      const response = handlePost(
        { pathInfo: PATH, postData: jsonBody(validOuter) },
        deps(() => {
          throw error;
        }),
      );
      expect(response).toMatchObject({
        ok: false,
        error: { code: "CONFLICT" },
      });
    }
  });

  it("classifies configuration and unexpected dispatcher failures as INTERNAL_ERROR without leaking the raw error", () => {
    const secretMessage = "SPREADSHEET_ID=super-secret-value";
    for (const error of [new ConfigurationError(), new Error(secretMessage)]) {
      const response = handlePost(
        { pathInfo: PATH, postData: jsonBody(validOuter) },
        deps(() => {
          throw error;
        }),
      );
      expect(response).toMatchObject({
        ok: false,
        error: { code: "INTERNAL_ERROR" },
      });
      expect(JSON.stringify(response)).not.toContain(secretMessage);
      expect(JSON.stringify(response)).not.toContain("super-secret-value");
    }
  });

  it("never leaks the request body or envelope contents into a failure response", () => {
    const secretPayload = { session_token: "top-secret-canary-value" };
    const response = handlePost(
      {
        pathInfo: PATH,
        postData: jsonBody({
          operation: "plans_create",
          envelope: secretPayload,
        }),
      },
      deps(() => {
        throw new Error("boom: top-secret-canary-value");
      }),
    );
    expect(JSON.stringify(response)).not.toContain("top-secret-canary-value");
  });
});
