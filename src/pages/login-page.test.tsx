import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AuthProvider } from "@/auth/auth-context";
import * as googleIdentityServices from "@/auth/google-identity-services";
import type { GoogleAccountsId } from "@/auth/google-identity-services";

vi.mock("@/config/env", () => ({
  environment: {
    appName: "Hotech Globe Tracker",
    googleClientId: "test-client-id",
  },
}));

import { LoginPage } from "./login-page";

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

function successNonce(nonce = "test-nonce") {
  return jsonResponse({
    ok: true,
    requestId: "r1",
    data: { nonce, expiresAt: "2026-01-01T00:05:00.000Z" },
  });
}

function successLogin(role = "Agent") {
  return jsonResponse({
    ok: true,
    requestId: "r1",
    data: {
      user: { fullName: "", role },
      redirectTo: `/${role.toLowerCase()}/dashboard`,
    },
  });
}

function successMe(role = "Agent") {
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

/** A fake accounts.id whose `initialize` captures the callback for tests to invoke directly. */
function fakeAccountsId(): {
  accountsId: GoogleAccountsId;
  fireCredential: (credential: string) => void;
  initializedWith: () => { client_id: string; nonce: string } | undefined;
} {
  let captured:
    | {
        client_id: string;
        nonce: string;
        callback: (r: { credential: string }) => void;
      }
    | undefined;
  const accountsId: GoogleAccountsId = {
    initialize: (config) => {
      captured = config as typeof captured;
    },
    renderButton: () => undefined,
    prompt: () => undefined,
  };
  return {
    accountsId,
    fireCredential: (credential) => captured?.callback({ credential }),
    initializedWith: () =>
      captured && { client_id: captured.client_id, nonce: captured.nonce },
  };
}

describe("LoginPage", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
    document.head.querySelectorAll("script").forEach((node) => node.remove());
  });

  it("renders the sign-in heading and never renders a password or OTP input", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(failureMe("AUTH_REQUIRED")) as unknown as typeof fetch;
    vi.spyOn(
      googleIdentityServices,
      "loadGoogleIdentityServices",
    ).mockRejectedValue(new Error("gis unavailable in test"));

    render(
      <MemoryRouter initialEntries={["/login"]}>
        <AuthProvider>
          <LoginPage />
        </AuthProvider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(
        screen.getByText("Sign in with your Google account to continue."),
      ).toBeInTheDocument();
    });
    expect(document.querySelector('input[type="password"]')).toBeNull();
    expect(
      screen.queryByLabelText(/otp|one-time|verification code/i),
    ).toBeNull();
  });

  it("shows the account-inactive message when the session state carries that error", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(
        failureMe("ACCOUNT_INACTIVE"),
      ) as unknown as typeof fetch;
    vi.spyOn(
      googleIdentityServices,
      "loadGoogleIdentityServices",
    ).mockRejectedValue(new Error("gis unavailable in test"));

    render(
      <MemoryRouter initialEntries={["/login"]}>
        <AuthProvider>
          <LoginPage />
        </AuthProvider>
      </MemoryRouter>,
    );

    expect(
      await screen.findByText(
        "This account is not active. Please contact your Admin.",
      ),
    ).toBeInTheDocument();
  });

  it("fetches a nonce, initializes GIS with it, and binds the resulting credential to /api/auth/login", async () => {
    const { accountsId, fireCredential, initializedWith } = fakeAccountsId();
    vi.spyOn(
      googleIdentityServices,
      "loadGoogleIdentityServices",
    ).mockResolvedValue(accountsId);

    let loggedIn = false;
    const fetchMock = vi.fn((url: string) => {
      if (url === "/api/auth/nonce")
        return Promise.resolve(successNonce("nonce-abc"));
      if (url === "/api/auth/login") {
        loggedIn = true;
        return Promise.resolve(successLogin("Agent"));
      }
      if (url === "/api/auth/me")
        return Promise.resolve(
          loggedIn ? successMe("Agent") : failureMe("AUTH_REQUIRED"),
        );
      return Promise.resolve(failureMe("AUTH_REQUIRED"));
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(
      <MemoryRouter initialEntries={["/login"]}>
        <AuthProvider>
          <LoginPage />
        </AuthProvider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(initializedWith()).toEqual({
        client_id: "test-client-id",
        nonce: "nonce-abc",
      });
    });

    fireCredential("gis-issued-id-token");

    await waitFor(() => {
      const loginCall = fetchMock.mock.calls.find(
        ([url]) => url === "/api/auth/login",
      );
      expect(loginCall).toBeDefined();
      const init = (loginCall as unknown as [string, RequestInit])[1];
      expect(init.body).toBe(
        JSON.stringify({ credential: "gis-issued-id-token" }),
      );
    });

    // The nonce is proven server-side via the ID token's own signed nonce
    // claim (server/auth/google-verifier.ts), not a separate field the
    // frontend sends — so binding is confirmed by GIS having been
    // initialized with the exact nonce the BFF issued, above.
    expect(
      fetchMock.mock.calls.filter(([url]) => url === "/api/auth/nonce"),
    ).toHaveLength(1);
  });

  it("ignores a second credential callback fired while the first login is still in flight", async () => {
    const { accountsId, fireCredential, initializedWith } = fakeAccountsId();
    vi.spyOn(
      googleIdentityServices,
      "loadGoogleIdentityServices",
    ).mockResolvedValue(accountsId);

    let loggedIn = false;
    let resolveLogin: (() => void) | undefined;
    const fetchMock = vi.fn((url: string) => {
      if (url === "/api/auth/nonce") return Promise.resolve(successNonce());
      if (url === "/api/auth/login")
        return new Promise((resolve) => {
          resolveLogin = () => {
            loggedIn = true;
            resolve(successLogin("Agent"));
          };
        });
      if (url === "/api/auth/me")
        return Promise.resolve(
          loggedIn ? successMe("Agent") : failureMe("AUTH_REQUIRED"),
        );
      return Promise.resolve(failureMe("AUTH_REQUIRED"));
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(
      <MemoryRouter initialEntries={["/login"]}>
        <AuthProvider>
          <LoginPage />
        </AuthProvider>
      </MemoryRouter>,
    );

    await waitFor(() => expect(initializedWith()).toBeDefined());

    fireCredential("first-credential");
    await waitFor(() => {
      expect(
        fetchMock.mock.calls.filter(([url]) => url === "/api/auth/login"),
      ).toHaveLength(1);
    });

    // A second callback fires (double-click / GIS re-invocation) while the
    // first login call is still pending.
    fireCredential("second-credential");

    resolveLogin?.();

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.filter(([url]) => url === "/api/auth/login"),
      ).toHaveLength(1);
    });
  });

  it("safely handles a nonce-fetch failure by showing the generic unavailable message", async () => {
    vi.spyOn(
      googleIdentityServices,
      "loadGoogleIdentityServices",
    ).mockResolvedValue(fakeAccountsId().accountsId);
    global.fetch = vi.fn((url: string) => {
      if (url === "/api/auth/nonce")
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            ok: false,
            requestId: "r1",
            error: { code: "RATE_LIMITED", message: "x" },
          }),
        });
      return Promise.resolve(failureMe("AUTH_REQUIRED"));
    }) as unknown as typeof fetch;

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

  it("never stores the nonce or ID token in localStorage or sessionStorage", async () => {
    const { accountsId, fireCredential, initializedWith } = fakeAccountsId();
    vi.spyOn(
      googleIdentityServices,
      "loadGoogleIdentityServices",
    ).mockResolvedValue(accountsId);
    let loggedIn = false;
    global.fetch = vi.fn((url: string) => {
      if (url === "/api/auth/nonce")
        return Promise.resolve(successNonce("nonce-xyz"));
      if (url === "/api/auth/login") {
        loggedIn = true;
        return Promise.resolve(successLogin("Admin"));
      }
      if (url === "/api/auth/me")
        return Promise.resolve(
          loggedIn ? successMe("Admin") : failureMe("AUTH_REQUIRED"),
        );
      return Promise.resolve(failureMe("AUTH_REQUIRED"));
    }) as unknown as typeof fetch;

    render(
      <MemoryRouter initialEntries={["/login"]}>
        <AuthProvider>
          <LoginPage />
        </AuthProvider>
      </MemoryRouter>,
    );

    await waitFor(() => expect(initializedWith()).toBeDefined());
    fireCredential("id-token-value");

    await waitFor(() => {
      expect(
        (global.fetch as ReturnType<typeof vi.fn>).mock.calls.some(
          ([url]) => url === "/api/auth/login",
        ),
      ).toBe(true);
    });

    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
    expect(JSON.stringify(localStorage)).not.toContain("nonce-xyz");
    expect(JSON.stringify(localStorage)).not.toContain("id-token-value");
    expect(JSON.stringify(sessionStorage)).not.toContain("nonce-xyz");
    expect(JSON.stringify(sessionStorage)).not.toContain("id-token-value");
  });
});
