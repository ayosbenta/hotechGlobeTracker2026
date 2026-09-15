import { describe, expect, it, vi } from "vitest";

import {
  AppsScriptDeniedError,
  AppsScriptUnavailableError,
  createAppsScriptAuthClient,
} from "../auth/apps-script-client";
import { nodeCryptoAdapter } from "../auth/crypto";

const config = {
  internalUrl: "https://script.google.com/macros/s/abc/exec",
  audience: "hotech-internal",
  signingKey: { keyId: "key-1", secret: "s".repeat(32) },
};
const clock = { now: () => new Date("2026-09-15T00:00:00.000Z") };

describe("Apps Script internal client", () => {
  it("signs the envelope and posts operation + envelope to the internal URL", async () => {
    let capturedBody: unknown;
    const fetcher = async (_url: string, init: { body: string }) => {
      capturedBody = JSON.parse(init.body);
      return {
        ok: true,
        status: 200,
        json: async () => ({ ok: true, data: { userId: "u1", role: "Agent" } }),
      };
    };
    const client = createAppsScriptAuthClient(
      config,
      nodeCryptoAdapter,
      clock,
      fetcher,
    );
    const result = await client.execute("validate_session", {
      session_token: "x".repeat(43),
    });
    expect(result).toEqual({ userId: "u1", role: "Agent" });
    const body = capturedBody as {
      operation: string;
      envelope: { signature: string; path: string };
    };
    expect(body.operation).toBe("validate_session");
    expect(body.envelope.path).toBe("/internal/v1/auth/session/validate");
    expect(typeof body.envelope.signature).toBe("string");
  });

  it("throws AppsScriptUnavailableError on network failure", async () => {
    const fetcher = async () => {
      throw new Error("network down");
    };
    const client = createAppsScriptAuthClient(
      config,
      nodeCryptoAdapter,
      clock,
      fetcher,
    );
    await expect(client.execute("logout", {})).rejects.toThrow(
      AppsScriptUnavailableError,
    );
  });

  it("throws AppsScriptUnavailableError on a 5xx response", async () => {
    const fetcher = async () => ({
      ok: false,
      status: 503,
      json: async () => ({}),
    });
    const client = createAppsScriptAuthClient(
      config,
      nodeCryptoAdapter,
      clock,
      fetcher,
    );
    await expect(client.execute("logout", {})).rejects.toThrow(
      AppsScriptUnavailableError,
    );
  });

  it("throws AppsScriptUnavailableError on a 429 (retryable, not a denial)", async () => {
    const fetcher = async () => ({
      ok: false,
      status: 429,
      json: async () => ({}),
    });
    const client = createAppsScriptAuthClient(
      config,
      nodeCryptoAdapter,
      clock,
      fetcher,
    );
    await expect(client.execute("logout", {})).rejects.toThrow(
      AppsScriptUnavailableError,
    );
  });

  it("throws AppsScriptUnavailableError on a 408 (retryable, not a denial)", async () => {
    const fetcher = async () => ({
      ok: false,
      status: 408,
      json: async () => ({}),
    });
    const client = createAppsScriptAuthClient(
      config,
      nodeCryptoAdapter,
      clock,
      fetcher,
    );
    await expect(client.execute("logout", {})).rejects.toThrow(
      AppsScriptUnavailableError,
    );
  });

  it("throws AppsScriptDeniedError on a 4xx response", async () => {
    const fetcher = async () => ({
      ok: false,
      status: 403,
      json: async () => ({}),
    });
    const client = createAppsScriptAuthClient(
      config,
      nodeCryptoAdapter,
      clock,
      fetcher,
    );
    await expect(client.execute("logout", {})).rejects.toThrow(
      AppsScriptDeniedError,
    );
  });

  it("throws AppsScriptUnavailableError on a malformed success body", async () => {
    const fetcher = async () => ({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, data: "not-an-object" }),
    });
    const client = createAppsScriptAuthClient(
      config,
      nodeCryptoAdapter,
      clock,
      fetcher,
    );
    await expect(client.execute("logout", {})).rejects.toThrow(
      AppsScriptUnavailableError,
    );
  });

  it("throws AppsScriptUnavailableError on non-JSON success", async () => {
    const fetcher = async () => ({
      ok: true,
      status: 200,
      json: async () => {
        throw new Error("not json");
      },
    });
    const client = createAppsScriptAuthClient(
      config,
      nodeCryptoAdapter,
      clock,
      fetcher,
    );
    await expect(client.execute("logout", {})).rejects.toThrow(
      AppsScriptUnavailableError,
    );
  });

  it("maps an HTTP-200 AUTH_DENIED failure envelope to AppsScriptDeniedError", async () => {
    const fetcher = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        ok: false,
        error: { code: "AUTH_DENIED", message: "denied" },
      }),
    });
    const client = createAppsScriptAuthClient(
      config,
      nodeCryptoAdapter,
      clock,
      fetcher,
    );
    await expect(client.execute("logout", {})).rejects.toThrow(
      AppsScriptDeniedError,
    );
  });

  it("maps an HTTP-200 CONFLICT failure envelope to AppsScriptUnavailableError", async () => {
    const fetcher = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        ok: false,
        error: { code: "CONFLICT", message: "conflict" },
      }),
    });
    const client = createAppsScriptAuthClient(
      config,
      nodeCryptoAdapter,
      clock,
      fetcher,
    );
    await expect(client.execute("logout", {})).rejects.toThrow(
      AppsScriptUnavailableError,
    );
  });

  it("maps an HTTP-200 INTERNAL_ERROR failure envelope to AppsScriptUnavailableError", async () => {
    const fetcher = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        ok: false,
        error: { code: "INTERNAL_ERROR", message: "internal" },
      }),
    });
    const client = createAppsScriptAuthClient(
      config,
      nodeCryptoAdapter,
      clock,
      fetcher,
    );
    await expect(client.execute("logout", {})).rejects.toThrow(
      AppsScriptUnavailableError,
    );
  });

  it("maps an unrecognized HTTP-200 failure code to AppsScriptUnavailableError", async () => {
    const fetcher = async () => ({
      ok: true,
      status: 200,
      json: async () => ({ ok: false, error: { code: "VALIDATION_ERROR" } }),
    });
    const client = createAppsScriptAuthClient(
      config,
      nodeCryptoAdapter,
      clock,
      fetcher,
    );
    await expect(client.execute("logout", {})).rejects.toThrow(
      AppsScriptUnavailableError,
    );
  });

  it("aborts and throws AppsScriptUnavailableError after the 12-second timeout with no retry", async () => {
    let callCount = 0;
    const fetcher = (
      _url: string,
      init: { signal?: AbortSignal },
    ): Promise<{ ok: boolean; status: number; json(): Promise<unknown> }> => {
      callCount += 1;
      return new Promise((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => {
          reject(new Error("aborted"));
        });
      });
    };
    const client = createAppsScriptAuthClient(
      config,
      nodeCryptoAdapter,
      clock,
      fetcher,
    );
    vi.useFakeTimers();
    try {
      const pending = client.execute("logout", {});
      const assertion = expect(pending).rejects.toThrow(
        AppsScriptUnavailableError,
      );
      await vi.advanceTimersByTimeAsync(12_000);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
    expect(callCount).toBe(1);
  });
});
