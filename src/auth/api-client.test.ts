import { afterEach, describe, expect, it, vi } from "vitest";

import {
  AuthApiError,
  fetchCsrfToken,
  fetchCurrentSession,
  logout,
  submitPasswordLogin,
} from "./api-client";

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

/**
 * jsdom's default test origin is http://localhost, and __Host- prefixed
 * cookies (server/auth/cookies.ts) are refused by the cookie jar without
 * Secure+HTTPS, so document.cookie cannot be exercised via a real
 * assignment here. This stubs the document.cookie getter directly so the
 * reader logic itself is still tested against the real jsdom Document.
 */
function stubDocumentCookie(value: string): () => void {
  const descriptor = Object.getOwnPropertyDescriptor(
    Document.prototype,
    "cookie",
  );
  Object.defineProperty(document, "cookie", {
    configurable: true,
    get: () => value,
  });
  return () => {
    if (descriptor)
      Object.defineProperty(Document.prototype, "cookie", descriptor);
  };
}

describe("auth api-client", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("submitPasswordLogin posts the username and password and maps a recognized role", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        ok: true,
        requestId: "r1",
        data: {
          user: { fullName: "", role: "Agent" },
          redirectTo: "/agent/dashboard",
        },
      }),
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await submitPasswordLogin("ryanzkey", "secret-value");
    expect(result.user.role).toBe("agent");
    expect(result.redirectTo).toBe("/agent/dashboard");
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.body).toBe(
      JSON.stringify({ username: "ryanzkey", password: "secret-value" }),
    );
  });

  it("submitPasswordLogin throws FORBIDDEN for an unrecognized role rather than guessing", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        ok: true,
        requestId: "r1",
        data: { user: { fullName: "", role: "SuperAdmin" }, redirectTo: "/x" },
      }),
    ) as unknown as typeof fetch;

    await expect(submitPasswordLogin("u", "p")).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("fetchCurrentSession returns the mapped user and session on success", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        ok: true,
        requestId: "r1",
        data: {
          user: { fullName: "", role: "Admin" },
          session: {
            idleExpiresAt: "2026-01-01T00:30:00.000Z",
            absoluteExpiresAt: "2026-01-01T08:00:00.000Z",
          },
          redirectTo: "/admin/dashboard",
        },
      }),
    ) as unknown as typeof fetch;

    const result = await fetchCurrentSession();
    expect(result.user.role).toBe("admin");
    expect(result.session.idleExpiresAt).toBe("2026-01-01T00:30:00.000Z");
  });

  it("fetchCurrentSession throws AuthApiError with the safe code on a failure envelope", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        ok: false,
        requestId: "r1",
        error: {
          code: "SESSION_EXPIRED",
          message: "Your session has expired.",
        },
      }),
    ) as unknown as typeof fetch;

    await expect(fetchCurrentSession()).rejects.toBeInstanceOf(AuthApiError);
    await expect(fetchCurrentSession()).rejects.toMatchObject({
      code: "SESSION_EXPIRED",
    });
  });

  it("maps an unrecognized error code to INTERNAL_ERROR rather than passing it through", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        ok: false,
        requestId: "r1",
        error: { code: "SOMETHING_NEW", message: "x" },
      }),
    ) as unknown as typeof fetch;

    await expect(fetchCurrentSession()).rejects.toMatchObject({
      code: "INTERNAL_ERROR",
    });
  });

  it("throws NETWORK_ERROR when fetch itself rejects", async () => {
    global.fetch = vi
      .fn()
      .mockRejectedValue(new Error("offline")) as unknown as typeof fetch;

    await expect(fetchCurrentSession()).rejects.toMatchObject({
      code: "NETWORK_ERROR",
    });
  });

  it("throws NETWORK_ERROR when the response body is not valid JSON", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => {
        throw new Error("not json");
      },
    }) as unknown as typeof fetch;

    await expect(fetchCurrentSession()).rejects.toMatchObject({
      code: "NETWORK_ERROR",
    });
  });

  it("fetchCsrfToken performs a GET and returns the token", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        ok: true,
        requestId: "r1",
        data: { csrfToken: "csrf-value" },
      }),
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await fetchCsrfToken();
    expect(result.csrfToken).toBe("csrf-value");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/csrf",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("logout reads the CSRF cookie and sends it as the X-CSRF-Token header", async () => {
    const restore = stubDocumentCookie("__Host-hotech_csrf=cookie-csrf-value");
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        ok: true,
        requestId: "r1",
        data: { loggedOut: true },
      }),
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    try {
      await logout();
    } finally {
      restore();
    }

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)["X-CSRF-Token"]).toBe(
      "cookie-csrf-value",
    );
  });

  it("logout omits the header entirely when no CSRF cookie is present", async () => {
    const restore = stubDocumentCookie("");
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        ok: true,
        requestId: "r1",
        data: { loggedOut: true },
      }),
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    try {
      await logout();
    } finally {
      restore();
    }

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(
      (init.headers as Record<string, string>)["X-CSRF-Token"],
    ).toBeUndefined();
  });
});
