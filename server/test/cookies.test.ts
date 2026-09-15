import { describe, expect, it } from "vitest";

import {
  clearCsrfCookie,
  clearLoginCookie,
  clearSessionCookie,
  CSRF_COOKIE_NAME,
  csrfCookie,
  LOGIN_COOKIE_NAME,
  loginCookie,
  parseCookies,
  SESSION_COOKIE_NAME,
  sessionCookie,
} from "../auth/cookies";

describe("cookie attributes", () => {
  it("login cookie is HttpOnly, Secure, SameSite=Lax, Path=/, no Domain", () => {
    const cookie = loginCookie("token-value", 300);
    expect(cookie).toContain(`${LOGIN_COOKIE_NAME}=token-value`);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain("Max-Age=300");
    expect(cookie).not.toContain("Domain=");
  });

  it("session cookie is HttpOnly, Secure, SameSite=Lax", () => {
    const cookie = sessionCookie("session-value", 28800);
    expect(cookie).toContain(`${SESSION_COOKIE_NAME}=session-value`);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
  });

  it("csrf cookie is Secure, SameSite=Strict, and NOT HttpOnly", () => {
    const cookie = csrfCookie("csrf-value", 28800);
    expect(cookie).toContain(`${CSRF_COOKIE_NAME}=csrf-value`);
    expect(cookie).not.toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Strict");
    expect(cookie).toContain("Secure");
  });

  it("clearing cookies sets Max-Age=0 and empty value while preserving attributes", () => {
    expect(clearLoginCookie()).toContain(`${LOGIN_COOKIE_NAME}=; `);
    expect(clearLoginCookie()).toContain("Max-Age=0");
    expect(clearSessionCookie()).toContain(`${SESSION_COOKIE_NAME}=; `);
    expect(clearSessionCookie()).toContain("HttpOnly");
    expect(clearCsrfCookie()).toContain(`${CSRF_COOKIE_NAME}=; `);
    expect(clearCsrfCookie()).not.toContain("HttpOnly");
  });

  it("parses a Cookie header into a name/value map", () => {
    const parsed = parseCookies("a=1; b=2;  c=3");
    expect(parsed).toEqual({ a: "1", b: "2", c: "3" });
  });

  it("parseCookies handles an absent header", () => {
    expect(parseCookies(null)).toEqual({});
    expect(parseCookies(undefined)).toEqual({});
  });
});
