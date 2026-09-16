import { roleFromServerValue } from "./role-mapping";
import type { AuthErrorCode, AuthSession, AuthUser } from "./types";

const CSRF_HEADER_NAME = "X-CSRF-Token";
const CSRF_COOKIE_NAME = "__Host-hotech_csrf";

/**
 * The CSRF cookie is intentionally not HttpOnly (server/auth/cookies.ts) so
 * the browser can echo its current value back as the X-CSRF-Token header,
 * per the BFF's double-submit check (server/auth/csrf.ts). This never reads
 * or trusts anything else from document.cookie.
 */
function readCsrfCookie(): string | null {
  const match = document.cookie
    .split("; ")
    .find((entry) => entry.startsWith(`${CSRF_COOKIE_NAME}=`));
  return match ? match.slice(CSRF_COOKIE_NAME.length + 1) : null;
}

export class AuthApiError extends Error {
  readonly code: AuthErrorCode;
  constructor(code: AuthErrorCode, message: string) {
    super(message);
    this.name = "AuthApiError";
    this.code = code;
  }
}

interface BffFailureBody {
  ok: false;
  requestId: string;
  error: { code: string; message: string };
}

/** Only the safe error codes the BFF documents are ever surfaced as such. */
const KNOWN_ERROR_CODES = new Set<AuthErrorCode>([
  "VALIDATION_ERROR",
  "AUTH_REQUIRED",
  "SESSION_EXPIRED",
  "ACCOUNT_INACTIVE",
  "ACCOUNT_LOCKED",
  "FORBIDDEN",
  "NOT_FOUND",
  "REPLAY_OR_CONFLICT",
  "RATE_LIMITED",
  "UPSTREAM_UNAVAILABLE",
  "AUTH_SERVICE_UNAVAILABLE",
  "INTERNAL_ERROR",
]);

function safeErrorCode(value: unknown): AuthErrorCode {
  return typeof value === "string" &&
    KNOWN_ERROR_CODES.has(value as AuthErrorCode)
    ? (value as AuthErrorCode)
    : "INTERNAL_ERROR";
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      credentials: "same-origin",
      headers: {
        ...(init.body ? { "content-type": "application/json" } : {}),
        ...init.headers,
      },
    });
  } catch {
    throw new AuthApiError(
      "NETWORK_ERROR",
      "Could not reach the authentication service.",
    );
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new AuthApiError(
      "NETWORK_ERROR",
      "The authentication service returned an invalid response.",
    );
  }

  if (
    body === null ||
    typeof body !== "object" ||
    (body as Record<string, unknown>).ok !== true
  ) {
    const failure = body as Partial<BffFailureBody> | null;
    throw new AuthApiError(
      safeErrorCode(failure?.error?.code),
      failure?.error?.message ?? "The request could not be processed.",
    );
  }

  return (body as { data: T }).data;
}

export interface LoginResult {
  readonly user: AuthUser;
  readonly redirectTo: string;
}

/** Never trusts the server's raw role string without validating it maps to a known Role. */
function toAuthUser(raw: { fullName: string; role: string }): AuthUser {
  const role = roleFromServerValue(raw.role);
  if (!role)
    throw new AuthApiError(
      "FORBIDDEN",
      "This account does not have a recognized role.",
    );
  return { fullName: raw.fullName, role };
}

export async function submitPasswordLogin(
  username: string,
  password: string,
): Promise<LoginResult> {
  const data = await request<{
    user: { fullName: string; role: string };
    redirectTo: string;
  }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
  return { user: toAuthUser(data.user), redirectTo: data.redirectTo };
}

export interface MeResult {
  readonly user: AuthUser;
  readonly session: AuthSession;
  readonly redirectTo: string;
}

export async function fetchCurrentSession(): Promise<MeResult> {
  const data = await request<{
    user: { fullName: string; role: string };
    session: AuthSession;
    redirectTo: string;
  }>("/api/auth/me", { method: "GET" });
  return {
    user: toAuthUser(data.user),
    session: data.session,
    redirectTo: data.redirectTo,
  };
}

export function fetchCsrfToken(): Promise<{ csrfToken: string }> {
  return request<{ csrfToken: string }>("/api/auth/csrf", { method: "GET" });
}

export async function logout(): Promise<void> {
  const csrfToken = readCsrfCookie();
  await request<{ loggedOut: true }>("/api/auth/logout", {
    method: "POST",
    headers: csrfToken ? { [CSRF_HEADER_NAME]: csrfToken } : {},
  });
}
