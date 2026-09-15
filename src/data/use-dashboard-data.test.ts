import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useDashboardData } from "@/data/use-dashboard-data";

function jsonResponse(body: unknown) {
  return { ok: true, json: async () => body };
}

function applicationsBody(
  apps: readonly Record<string, unknown>[],
  nextCursor: string | null = null,
) {
  return {
    ok: true,
    requestId: "r1",
    data: { applications: apps, nextCursor },
    meta: { timestamp: "2026-01-01T00:00:00.000Z", nextCursor },
  };
}

const SAMPLE_APP = {
  applicationId: "a1",
  customerFullName: "Juan Dela Cruz",
  completeAddress: "123 Rizal St",
  cityMunicipality: "Quezon City",
  province: "Metro Manila",
  agentId: "agent-1",
  processorId: "proc-1",
  currentStatus: "Pending",
  planNameSnapshot: "GFiber Unli 1499",
  submittedAt: "2026-01-05T00:00:00.000Z",
  version: 1,
};

describe("useDashboardData", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("starts loading, then resolves to populated with derived metrics", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(jsonResponse(applicationsBody([SAMPLE_APP])));

    const { result } = renderHook(() => useDashboardData("admin"));
    expect(result.current.state).toBe("loading");

    await waitFor(() => expect(result.current.state).toBe("populated"));
    expect(result.current.rows).toHaveLength(1);
    expect(result.current.rows[0]).toMatchObject({
      customer: "Juan Dela Cruz",
      status: "Pending",
    });
    const total = result.current.metrics.find(
      (m) => m.label === "Total Applications",
    );
    expect(total?.value).toBe("1");
  });

  it("resolves to empty when there are zero applications", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(jsonResponse(applicationsBody([])));

    const { result } = renderHook(() => useDashboardData("agent"));
    await waitFor(() => expect(result.current.state).toBe("empty"));
  });

  it("resolves to error when the fetch fails", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("network down"));

    const { result } = renderHook(() => useDashboardData("processor"));
    await waitFor(() => expect(result.current.state).toBe("error"));
  });

  it("resolves to error on a non-ok BFF response", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      jsonResponse({
        ok: false,
        requestId: "r1",
        error: { code: "INTERNAL_ERROR", message: "boom" },
      }),
    );

    const { result } = renderHook(() => useDashboardData("admin"));
    await waitFor(() => expect(result.current.state).toBe("error"));
  });

  it("paginates through nextCursor to fetch every page", async () => {
    let call = 0;
    const fetchMock = vi.fn().mockImplementation(async () => {
      call += 1;
      return call === 1
        ? jsonResponse(applicationsBody([SAMPLE_APP], "25"))
        : jsonResponse(
            applicationsBody([{ ...SAMPLE_APP, applicationId: "a2" }], null),
          );
    });
    global.fetch = fetchMock;

    // "agent" role never fetches /api/users, so every call here is an
    // /api/applications page fetch.
    const { result } = renderHook(() => useDashboardData("agent"));
    await waitFor(() => expect(result.current.state).toBe("populated"));
    expect(call).toBe(2);
    expect(new Set(result.current.rows.map((r) => r.applicationId))).toEqual(
      new Set(["a1", "a2"]),
    );
  });

  it("computes agent/processor quick-stat counts for Admin only", async () => {
    global.fetch = vi
      .fn()
      .mockImplementation(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("/api/applications"))
          return jsonResponse(applicationsBody([SAMPLE_APP]));
        if (url.includes("/api/users"))
          return jsonResponse({
            ok: true,
            requestId: "r1",
            data: {
              users: [
                {
                  userId: "u1",
                  fullName: "A",
                  role: "Agent",
                  accountStatus: "Active",
                },
                {
                  userId: "u2",
                  fullName: "B",
                  role: "Processor",
                  accountStatus: "Active",
                },
              ],
              nextCursor: null,
            },
            meta: { timestamp: "2026-01-01T00:00:00.000Z", nextCursor: null },
          });
        throw new Error(`unexpected fetch: ${url}`);
      });

    const { result } = renderHook(() => useDashboardData("admin"));
    await waitFor(() => expect(result.current.state).toBe("populated"));
    expect(result.current.agentCount).toBe(1);
    expect(result.current.processorCount).toBe(1);
  });

  it("does not set agent/processor counts for non-Admin roles", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(jsonResponse(applicationsBody([SAMPLE_APP])));

    const { result } = renderHook(() => useDashboardData("agent"));
    await waitFor(() => expect(result.current.state).toBe("populated"));
    expect(result.current.agentCount).toBeUndefined();
    expect(result.current.processorCount).toBeUndefined();
  });
});
