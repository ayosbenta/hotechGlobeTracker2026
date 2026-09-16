import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AuthProvider } from "@/auth/auth-context";

import { LoginPage } from "./login-page";

function jsonResponse(body: unknown) {
  return { ok: true, status: 200, json: async () => body };
}

function failure(code: string) {
  return jsonResponse({
    ok: false,
    requestId: "r1",
    error: { code, message: "x" },
  });
}

function successLogin(role = "Admin") {
  return jsonResponse({
    ok: true,
    requestId: "r1",
    data: {
      user: { fullName: "", role },
      redirectTo: `/${role.toLowerCase()}/dashboard`,
    },
  });
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

function renderLogin() {
  render(
    <MemoryRouter initialEntries={["/login"]}>
      <AuthProvider>
        <Routes>
          <Route element={<LoginPage />} path="/login" />
          <Route element={<p>Admin dashboard</p>} path="/admin/dashboard" />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

function fillAndSubmit(username: string, password: string) {
  fireEvent.change(screen.getByLabelText("Username"), {
    target: { value: username },
  });
  fireEvent.change(screen.getByLabelText("Password"), {
    target: { value: password },
  });
  fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
}

function loginCalls(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls.filter(([url]) => url === "/api/auth/login");
}

describe("LoginPage", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("renders a username/password form and no Google sign-in", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(failure("AUTH_REQUIRED")) as unknown as typeof fetch;

    renderLogin();

    expect(
      await screen.findByText(
        "Sign in with your username and password to continue.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Username")).toHaveAttribute("type", "text");
    expect(screen.getByLabelText("Password")).toHaveAttribute(
      "type",
      "password",
    );
    expect(document.querySelector('script[src*="accounts.google.com"]')).toBe(
      null,
    );
  });

  it("posts the credentials to /api/auth/login and redirects on success", async () => {
    let loggedIn = false;
    const fetchMock = vi.fn((url: string) => {
      if (url === "/api/auth/login") {
        loggedIn = true;
        return Promise.resolve(successLogin("Admin"));
      }
      if (url === "/api/auth/me")
        return Promise.resolve(
          loggedIn ? successMe("Admin") : failure("AUTH_REQUIRED"),
        );
      return Promise.resolve(failure("AUTH_REQUIRED"));
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    renderLogin();
    await screen.findByLabelText("Username");
    fillAndSubmit("ryanzkey", "the-password");

    expect(await screen.findByText("Admin dashboard")).toBeInTheDocument();
    const [, init] = loginCalls(fetchMock)[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(init.method).toBe("POST");
    expect(init.body).toBe(
      JSON.stringify({ username: "ryanzkey", password: "the-password" }),
    );
  });

  it("shows an error and clears the password when the credentials are rejected", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(failure("AUTH_REQUIRED")) as unknown as typeof fetch;

    renderLogin();
    await screen.findByLabelText("Username");
    fillAndSubmit("ryanzkey", "wrong");

    expect(
      await screen.findByText("Incorrect username or password."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toHaveValue("");
  });

  it("shows a rate-limit message when too many attempts are made", async () => {
    global.fetch = vi.fn((url: string) =>
      Promise.resolve(
        url === "/api/auth/login"
          ? failure("RATE_LIMITED")
          : failure("AUTH_REQUIRED"),
      ),
    ) as unknown as typeof fetch;

    renderLogin();
    await screen.findByLabelText("Username");
    fillAndSubmit("ryanzkey", "pw");

    expect(
      await screen.findByText(
        "Too many sign-in attempts. Please wait and try again.",
      ),
    ).toBeInTheDocument();
  });

  it("does not submit when a field is empty", async () => {
    const fetchMock = vi.fn().mockResolvedValue(failure("AUTH_REQUIRED"));
    global.fetch = fetchMock as unknown as typeof fetch;

    renderLogin();
    await screen.findByLabelText("Username");
    fillAndSubmit("ryanzkey", "");

    expect(
      await screen.findByText("Enter your username and password."),
    ).toBeInTheDocument();
    expect(loginCalls(fetchMock)).toHaveLength(0);
  });

  it("ignores a second submit while the first login is still in flight", async () => {
    let resolveLogin: (() => void) | undefined;
    const fetchMock = vi.fn((url: string) => {
      if (url === "/api/auth/login")
        return new Promise((resolve) => {
          resolveLogin = () => resolve(failure("AUTH_REQUIRED"));
        });
      return Promise.resolve(failure("AUTH_REQUIRED"));
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    renderLogin();
    await screen.findByLabelText("Username");
    fillAndSubmit("ryanzkey", "pw");
    fireEvent.submit(
      screen.getByRole("button", { name: "Signing you in…" }).closest("form")!,
    );

    await waitFor(() => expect(loginCalls(fetchMock)).toHaveLength(1));
    resolveLogin?.();
    expect(
      await screen.findByText("Incorrect username or password."),
    ).toBeInTheDocument();
    expect(loginCalls(fetchMock)).toHaveLength(1);
  });

  it("never stores the password in localStorage or sessionStorage", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(failure("AUTH_REQUIRED")) as unknown as typeof fetch;

    renderLogin();
    await screen.findByLabelText("Username");
    fillAndSubmit("ryanzkey", "secret-password-value");
    await screen.findByText("Incorrect username or password.");

    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });

  it("shows the account-inactive message when the session state carries that error", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(
        failure("ACCOUNT_INACTIVE"),
      ) as unknown as typeof fetch;

    renderLogin();

    expect(
      await screen.findByText(
        "This account is not active. Please contact your Admin.",
      ),
    ).toBeInTheDocument();
  });
});
