import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AuthProvider, useAuth } from "./auth-context";

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

function Probe() {
  const { state } = useAuth();
  return <div data-testid="state">{JSON.stringify(state)}</div>;
}

function ProbeWithLogout() {
  const { state, logout } = useAuth();
  return (
    <div>
      <div data-testid="state">{JSON.stringify(state)}</div>
      <button onClick={() => void logout()} type="button">
        Logout
      </button>
    </div>
  );
}

describe("AuthProvider", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("starts in checking state and transitions to authenticated on a successful /api/auth/me", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(successMe("Admin")) as unknown as typeof fetch;

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("state").textContent).toContain(
        "authenticated",
      );
    });
    expect(screen.getByTestId("state").textContent).toContain('"role":"admin"');
  });

  it("treats AUTH_REQUIRED as unauthenticated, not an error", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(failureMe("AUTH_REQUIRED")) as unknown as typeof fetch;

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("state").textContent).toBe(
        JSON.stringify({ status: "unauthenticated" }),
      );
    });
  });

  it("treats SESSION_EXPIRED as unauthenticated, not an error", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(
        failureMe("SESSION_EXPIRED"),
      ) as unknown as typeof fetch;

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("state").textContent).toBe(
        JSON.stringify({ status: "unauthenticated" }),
      );
    });
  });

  it("surfaces ACCOUNT_INACTIVE as a distinct error state, not unauthenticated", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(
        failureMe("ACCOUNT_INACTIVE"),
      ) as unknown as typeof fetch;

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("state").textContent).toContain(
        '"status":"error"',
      );
      expect(screen.getByTestId("state").textContent).toContain(
        "ACCOUNT_INACTIVE",
      );
    });
  });

  it("surfaces ACCOUNT_LOCKED as a distinct error state", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(
        failureMe("ACCOUNT_LOCKED"),
      ) as unknown as typeof fetch;

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("state").textContent).toContain(
        "ACCOUNT_LOCKED",
      );
    });
  });

  it("surfaces a network failure as an error state", async () => {
    global.fetch = vi
      .fn()
      .mockRejectedValue(new Error("offline")) as unknown as typeof fetch;

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("state").textContent).toContain(
        '"status":"error"',
      );
      expect(screen.getByTestId("state").textContent).toContain(
        "NETWORK_ERROR",
      );
    });
  });

  it("surfaces RATE_LIMITED as a distinct error state", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(failureMe("RATE_LIMITED")) as unknown as typeof fetch;

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("state").textContent).toContain(
        '"status":"error"',
      );
      expect(screen.getByTestId("state").textContent).toContain("RATE_LIMITED");
    });
  });

  it("logout() resolves to unauthenticated after a successful POST /api/auth/logout", async () => {
    const fetchMock = vi.fn((url: string) =>
      url === "/api/auth/logout"
        ? Promise.resolve(
            jsonResponse({
              ok: true,
              requestId: "r1",
              data: { loggedOut: true },
            }),
          )
        : Promise.resolve(successMe("Admin")),
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    render(
      <AuthProvider>
        <ProbeWithLogout />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("state").textContent).toContain(
        "authenticated",
      );
    });

    screen.getByRole("button", { name: "Logout" }).click();

    await waitFor(() => {
      expect(screen.getByTestId("state").textContent).toBe(
        JSON.stringify({ status: "unauthenticated" }),
      );
    });
  });

  it("logout() still resolves to unauthenticated when the logout request itself fails (server unavailable)", async () => {
    const fetchMock = vi.fn((url: string) =>
      url === "/api/auth/logout"
        ? Promise.reject(new Error("network down"))
        : Promise.resolve(successMe("Admin")),
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    render(
      <AuthProvider>
        <ProbeWithLogout />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("state").textContent).toContain(
        "authenticated",
      );
    });

    screen.getByRole("button", { name: "Logout" }).click();

    await waitFor(() => {
      expect(screen.getByTestId("state").textContent).toBe(
        JSON.stringify({ status: "unauthenticated" }),
      );
    });
  });
});
