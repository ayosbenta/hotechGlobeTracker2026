export const LOGIN_COOKIE_NAME = "__Host-hotech_login";
export const SESSION_COOKIE_NAME = "__Host-hotech_session";
export const CSRF_COOKIE_NAME = "__Host-hotech_csrf";
export const CSRF_HEADER_NAME = "x-csrf-token";

interface CookieAttributes {
  name: string;
  value: string;
  maxAgeSeconds: number;
  httpOnly: boolean;
  sameSite: "Lax" | "Strict";
}

function serializeCookie(attrs: CookieAttributes): string {
  const parts = [
    `${attrs.name}=${attrs.value}`,
    "Path=/",
    `Max-Age=${Math.max(0, Math.floor(attrs.maxAgeSeconds))}`,
    "Secure",
    `SameSite=${attrs.sameSite}`,
  ];
  if (attrs.httpOnly) parts.push("HttpOnly");
  return parts.join("; ");
}

function clearCookie(
  name: string,
  sameSite: "Lax" | "Strict",
  httpOnly: boolean,
): string {
  return serializeCookie({
    name,
    value: "",
    maxAgeSeconds: 0,
    httpOnly,
    sameSite,
  });
}

export function loginCookie(token: string, maxAgeSeconds = 300): string {
  return serializeCookie({
    name: LOGIN_COOKIE_NAME,
    value: token,
    maxAgeSeconds,
    httpOnly: true,
    sameSite: "Lax",
  });
}

export function clearLoginCookie(): string {
  return clearCookie(LOGIN_COOKIE_NAME, "Lax", true);
}

export function sessionCookie(token: string, maxAgeSeconds: number): string {
  return serializeCookie({
    name: SESSION_COOKIE_NAME,
    value: token,
    maxAgeSeconds,
    httpOnly: true,
    sameSite: "Lax",
  });
}

export function clearSessionCookie(): string {
  return clearCookie(SESSION_COOKIE_NAME, "Lax", true);
}

export function csrfCookie(token: string, maxAgeSeconds: number): string {
  return serializeCookie({
    name: CSRF_COOKIE_NAME,
    value: token,
    maxAgeSeconds,
    httpOnly: false,
    sameSite: "Strict",
  });
}

export function clearCsrfCookie(): string {
  return clearCookie(CSRF_COOKIE_NAME, "Strict", false);
}

export function parseCookies(
  header: string | undefined | null,
): Record<string, string> {
  const result: Record<string, string> = {};
  if (!header) return result;
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator === -1) continue;
    const name = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (name) result[name] = value;
  }
  return result;
}
