import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AuthProvider } from "@/auth/auth-context";

import { DashboardShell } from "./dashboard-shell";

function jsonResponse(body: unknown) {
  return { ok: true, status: 200, json: async () => body };
}

function successMe(role = "Admin") {
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

function renderShell() {
  return render(
    <MemoryRouter initialEntries={["/admin/dashboard"]}>
      <AuthProvider>
        <Routes>
          <Route
            element={
              <DashboardShell role="admin">
                <div>Dashboard body</div>
              </DashboardShell>
            }
            path="/admin/dashboard"
          />
          <Route element={<div>Login screen</div>} path="/login" />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe("DashboardShell logout control", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("preserves the sidebar navigation and dashboard content alongside the logout control", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(successMe("Admin")) as unknown as typeof fetch;

    renderShell();

    expect(await screen.findByText("Dashboard body")).toBeInTheDocument();
    expect(
      screen.getAllByRole("link", { name: /Hotech Globe Tracker/i })[0],
    ).toBeInTheDocument();
    expect(screen.getAllByText("Applications")[0]).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Sign out" }),
    ).toBeInTheDocument();
  });

  it("calls POST /api/auth/logout, clears state, and redirects to /login on success", async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url === "/api/auth/logout") {
        return Promise.resolve(
          jsonResponse({
            ok: true,
            requestId: "r1",
            data: { loggedOut: true },
          }),
        );
      }
      return Promise.resolve(successMe("Admin"));
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    renderShell();

    const signOutButton = await screen.findByRole("button", {
      name: "Sign out",
    });
    signOutButton.click();

    await waitFor(() => {
      expect(screen.getByText("Login screen")).toBeInTheDocument();
    });

    const logoutCall = fetchMock.mock.calls.find(
      ([url]) => url === "/api/auth/logout",
    );
    expect(logoutCall).toBeDefined();
    const init = (logoutCall as unknown as [string, RequestInit])[1];
    expect(init.method).toBe("POST");
  });

  it("still clears state and redirects to /login when the logout request fails (server unavailable)", async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url === "/api/auth/logout")
        return Promise.reject(new Error("network down"));
      return Promise.resolve(successMe("Admin"));
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    renderShell();

    const signOutButton = await screen.findByRole("button", {
      name: "Sign out",
    });
    signOutButton.click();

    await waitFor(() => {
      expect(screen.getByText("Login screen")).toBeInTheDocument();
    });
  });

  it("disables the sign-out control while a logout request is in flight, preventing a second click", async () => {
    let resolveLogout: (() => void) | undefined;
    const fetchMock = vi.fn((url: string) => {
      if (url === "/api/auth/logout")
        return new Promise((resolve) => {
          resolveLogout = () =>
            resolve(
              jsonResponse({
                ok: true,
                requestId: "r1",
                data: { loggedOut: true },
              }),
            );
        });
      return Promise.resolve(successMe("Admin"));
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    renderShell();

    const signOutButton = await screen.findByRole("button", {
      name: "Sign out",
    });
    signOutButton.click();

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Signing out…" }),
      ).toBeDisabled();
    });

    resolveLogout?.();
    await waitFor(() => {
      expect(screen.getByText("Login screen")).toBeInTheDocument();
    });

    expect(
      fetchMock.mock.calls.filter(([url]) => url === "/api/auth/logout"),
    ).toHaveLength(1);
  });

  it("never exposes a session or CSRF value in the rendered DOM", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(successMe("Admin")) as unknown as typeof fetch;

    const { container } = renderShell();
    await screen.findByText("Dashboard body");

    expect(container.innerHTML).not.toMatch(/__Host-hotech_(session|csrf)/);
    expect(container.innerHTML).not.toMatch(/session_token|csrf_token/i);
  });
});
