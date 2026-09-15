import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AuthProvider } from "@/auth/auth-context";

import { LoginPage } from "./login-page";

/**
 * Kept in its own file (no @/config/env mock) so environment.googleClientId
 * is genuinely undefined, matching every real local/CI environment where no
 * VITE_GOOGLE_CLIENT_ID is set.
 */
function jsonResponse(body: unknown) {
  return { ok: true, status: 200, json: async () => body };
}

function failureMe(code: string) {
  return jsonResponse({
    ok: false,
    requestId: "r1",
    error: { code, message: "x" },
  });
}

describe("LoginPage without a configured Google Client ID", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("shows a safe unavailable message when no Google Client ID is configured", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(failureMe("AUTH_REQUIRED")) as unknown as typeof fetch;

    render(
      <MemoryRouter initialEntries={["/login"]}>
        <AuthProvider>
          <LoginPage />
        </AuthProvider>
      </MemoryRouter>,
    );

    expect(
      await screen.findByText(
        "Sign-in is temporarily unavailable. Please try again shortly.",
      ),
    ).toBeInTheDocument();
  });
});
