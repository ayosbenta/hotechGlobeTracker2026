import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "@/app";

function mockMeResponse(role: string) {
  return {
    ok: true,
    json: async () => ({
      ok: true,
      requestId: "r1",
      data: {
        user: { fullName: "Test User", role },
        session: {
          idleExpiresAt: "2026-01-01T00:00:00.000Z",
          absoluteExpiresAt: "2026-01-01T08:00:00.000Z",
        },
        redirectTo: `/${role.toLowerCase()}/dashboard`,
      },
    }),
  };
}

function mockUnauthenticatedResponse() {
  return {
    ok: true,
    json: async () => ({
      ok: false,
      requestId: "r1",
      error: { code: "AUTH_REQUIRED", message: "Sign in is required." },
    }),
  };
}

describe("App routes", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("renders the Agent dashboard once GET /api/auth/me confirms an authenticated Agent session", async () => {
    global.fetch = vi.fn().mockResolvedValue(mockMeResponse("Agent"));

    render(
      <MemoryRouter initialEntries={["/agent/dashboard"]}>
        <App />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole("heading", { name: "Good morning, Maria!" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Add New Application" }),
    ).toBeInTheDocument();
  });

  it("redirects an unauthenticated visitor away from a protected dashboard route to /login", async () => {
    global.fetch = vi.fn().mockResolvedValue(mockUnauthenticatedResponse());

    render(
      <MemoryRouter initialEntries={["/agent/dashboard"]}>
        <App />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(
        screen.getByText("Sign in with your Google account to continue."),
      ).toBeInTheDocument();
    });
  });

  it("redirects a signed-in Agent away from the Admin dashboard to their own canonical route", async () => {
    global.fetch = vi.fn().mockResolvedValue(mockMeResponse("Agent"));

    render(
      <MemoryRouter initialEntries={["/admin/dashboard"]}>
        <App />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole("heading", { name: "Good morning, Maria!" }),
    ).toBeInTheDocument();
  });
});
