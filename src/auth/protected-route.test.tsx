import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AuthProvider } from "./auth-context";
import { ProtectedRoute } from "./protected-route";

function jsonResponse(body: unknown) {
  return { ok: true, status: 200, json: async () => body };
}

function successMe(role: string) {
  return jsonResponse({
    ok: true,
    requestId: "r1",
    data: {
      user: { fullName: "", role },
      session: {
        idleExpiresAt: "2026-01-01T00:30:00.000Z",
        absoluteExpiresAt: "2026-01-01T08:00:00.000Z",
      },
      redirectTo: `/${role.toLowerCase()}/dashboard`,
    },
  });
}

function failureMe(code: string) {
  return jsonResponse({
    ok: false,
    requestId: "r1",
    error: { code, message: "x" },
  });
}

function renderGuarded(initialPath: string) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <AuthProvider>
        <Routes>
          <Route element={<div>Login screen</div>} path="/login" />
          <Route
            element={
              <ProtectedRoute role="admin">
                <div>Admin content</div>
              </ProtectedRoute>
            }
            path="/admin/dashboard"
          />
          <Route
            element={
              <ProtectedRoute role="agent">
                <div>Agent content</div>
              </ProtectedRoute>
            }
            path="/agent/dashboard"
          />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe("ProtectedRoute", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("renders the guarded content once the session's role matches the route", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(successMe("Admin")) as unknown as typeof fetch;

    renderGuarded("/admin/dashboard");

    expect(await screen.findByText("Admin content")).toBeInTheDocument();
  });

  it("redirects to /login when unauthenticated", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(failureMe("AUTH_REQUIRED")) as unknown as typeof fetch;

    renderGuarded("/admin/dashboard");

    expect(await screen.findByText("Login screen")).toBeInTheDocument();
  });

  it("redirects an expired session to /login", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(
        failureMe("SESSION_EXPIRED"),
      ) as unknown as typeof fetch;

    renderGuarded("/agent/dashboard");

    expect(await screen.findByText("Login screen")).toBeInTheDocument();
  });

  it("redirects a signed-in user of the wrong role to their own canonical route, never the requested one", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(successMe("Agent")) as unknown as typeof fetch;

    renderGuarded("/admin/dashboard");

    expect(await screen.findByText("Agent content")).toBeInTheDocument();
    expect(screen.queryByText("Admin content")).not.toBeInTheDocument();
  });

  it("shows a safe error view for ACCOUNT_INACTIVE instead of the guarded content or a silent redirect", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(
        failureMe("ACCOUNT_INACTIVE"),
      ) as unknown as typeof fetch;

    renderGuarded("/admin/dashboard");

    await waitFor(() => {
      expect(
        screen.getByText("Your account needs attention"),
      ).toBeInTheDocument();
    });
    expect(screen.queryByText("Admin content")).not.toBeInTheDocument();
    expect(screen.queryByText("Login screen")).not.toBeInTheDocument();
  });

  it("shows a safe error view for ACCOUNT_LOCKED", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(
        failureMe("ACCOUNT_LOCKED"),
      ) as unknown as typeof fetch;

    renderGuarded("/admin/dashboard");

    await waitFor(() => {
      expect(
        screen.getByText("Your account needs attention"),
      ).toBeInTheDocument();
    });
  });

  it("shows a safe rate-limited message instead of the guarded content or a silent redirect", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(failureMe("RATE_LIMITED")) as unknown as typeof fetch;

    renderGuarded("/admin/dashboard");

    await waitFor(() => {
      expect(
        screen.getByText(
          "Too many attempts. Please wait a moment and try again.",
        ),
      ).toBeInTheDocument();
    });
    expect(screen.queryByText("Admin content")).not.toBeInTheDocument();
    expect(screen.queryByText("Login screen")).not.toBeInTheDocument();
  });

  it("shows a safe generic-failure message for an unrecognized/internal error code", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(
        failureMe("INTERNAL_ERROR"),
      ) as unknown as typeof fetch;

    renderGuarded("/admin/dashboard");

    await waitFor(() => {
      expect(
        screen.getByText("Please try again. No changes were made."),
      ).toBeInTheDocument();
    });
  });

  it("shows a safe service-unavailable message for AUTH_SERVICE_UNAVAILABLE", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(
        failureMe("AUTH_SERVICE_UNAVAILABLE"),
      ) as unknown as typeof fetch;

    renderGuarded("/admin/dashboard");

    await waitFor(() => {
      expect(
        screen.getByText(
          "The service is temporarily unavailable. Please try again shortly.",
        ),
      ).toBeInTheDocument();
    });
  });
});
