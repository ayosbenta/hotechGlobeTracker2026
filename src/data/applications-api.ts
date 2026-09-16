import type { ApplicationStatus } from "@/types/application";

const CSRF_COOKIE_NAME = "__Host-hotech_csrf";

export type DataApiErrorCode =
  | "VALIDATION_ERROR"
  | "AUTH_REQUIRED"
  | "SESSION_EXPIRED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "REPLAY_OR_CONFLICT"
  | "RATE_LIMITED"
  | "UPSTREAM_UNAVAILABLE"
  | "AUTH_SERVICE_UNAVAILABLE"
  | "INTERNAL_ERROR"
  | "NETWORK_ERROR";

export class DataApiError extends Error {
  readonly code: DataApiErrorCode;
  constructor(code: DataApiErrorCode, message: string) {
    super(message);
    this.name = "DataApiError";
    this.code = code;
  }
}

const KNOWN_CODES = new Set<DataApiErrorCode>([
  "VALIDATION_ERROR",
  "AUTH_REQUIRED",
  "SESSION_EXPIRED",
  "FORBIDDEN",
  "NOT_FOUND",
  "REPLAY_OR_CONFLICT",
  "RATE_LIMITED",
  "UPSTREAM_UNAVAILABLE",
  "AUTH_SERVICE_UNAVAILABLE",
  "INTERNAL_ERROR",
]);

function safeCode(value: unknown): DataApiErrorCode {
  return typeof value === "string" && KNOWN_CODES.has(value as DataApiErrorCode)
    ? (value as DataApiErrorCode)
    : "INTERNAL_ERROR";
}

function readCsrfCookie(): string | null {
  const match = document.cookie
    .split("; ")
    .find((entry) => entry.startsWith(`${CSRF_COOKIE_NAME}=`));
  return match ? match.slice(CSRF_COOKIE_NAME.length + 1) : null;
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
    throw new DataApiError("NETWORK_ERROR", "Could not reach the server.");
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new DataApiError(
      "NETWORK_ERROR",
      "The server returned an invalid response.",
    );
  }

  if (
    body === null ||
    typeof body !== "object" ||
    (body as Record<string, unknown>).ok !== true
  ) {
    const failure = body as {
      error?: { code?: string; message?: string };
    } | null;
    throw new DataApiError(
      safeCode(failure?.error?.code),
      failure?.error?.message ?? "The request could not be processed.",
    );
  }

  return (body as { data: T }).data;
}

export interface ApplicationSummary {
  readonly applicationId: string;
  readonly customerFullName: string;
  readonly completeAddress: string;
  readonly cityMunicipality: string;
  readonly province: string;
  readonly agentId: string;
  readonly processorId: string;
  readonly currentStatus: ApplicationStatus;
  readonly planNameSnapshot: string;
  readonly submittedAt: string;
  readonly version: number;
}

export interface ListApplicationsResult {
  readonly applications: readonly ApplicationSummary[];
  readonly nextCursor: string | null;
}

/**
 * Fetches every page of /api/applications for the caller's own role-scoped
 * view (Apps Script enforces the actual scoping server-side; this client
 * never filters or trusts a client-side role check as authorization). Caps
 * total pages fetched to avoid unbounded requests against a very large
 * dataset.
 */
export async function fetchAllApplications(
  maxPages = 20,
): Promise<readonly ApplicationSummary[]> {
  const all: ApplicationSummary[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < maxPages; page += 1) {
    const body: string | undefined = cursor
      ? JSON.stringify({ cursor })
      : undefined;
    const result: ListApplicationsResult =
      await request<ListApplicationsResult>("/api/applications", {
        method: "GET",
        body,
      });
    all.push(...result.applications);
    cursor = result.nextCursor;
    if (cursor === null) break;
  }
  return all;
}

export interface PlanSummary {
  readonly planId: string;
  readonly planName: string;
  readonly monthlyPrice: number;
  readonly speedMbps: number;
  readonly planStatus: "Active" | "Inactive";
}

export async function fetchActivePlans(): Promise<readonly PlanSummary[]> {
  const result = await request<{
    plans: readonly PlanSummary[];
    nextCursor: string | null;
  }>("/api/plans", { method: "GET" });
  return result.plans.filter((plan) => plan.planStatus === "Active");
}

export interface UserSummary {
  readonly userId: string;
  readonly fullName: string;
  readonly role: "Admin" | "Agent" | "Processor";
  readonly accountStatus: "Active" | "Inactive" | "Locked";
}

export async function fetchAllUsers(
  maxPages = 20,
): Promise<readonly UserSummary[]> {
  const all: UserSummary[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < maxPages; page += 1) {
    const body: string | undefined = cursor
      ? JSON.stringify({ cursor })
      : undefined;
    const result: { users: readonly UserSummary[]; nextCursor: string | null } =
      await request("/api/users", { method: "GET", body });
    all.push(...result.users);
    cursor = result.nextCursor;
    if (cursor === null) break;
  }
  return all;
}

/** Reads the current CSRF cookie value for a future mutating call from a dashboard surface. */
export function currentCsrfToken(): string | null {
  return readCsrfCookie();
}

export interface DashboardAggregateBucket {
  readonly date: string;
  readonly submittedCounts: Readonly<Record<ApplicationStatus, number>>;
  readonly statusChangeCounts: Readonly<Record<ApplicationStatus, number>>;
}

export interface DashboardAggregateResult {
  readonly rangeStartDate: string;
  readonly rangeEndDate: string;
  readonly buckets: readonly DashboardAggregateBucket[];
}

function isDashboardAggregateResult(
  value: unknown,
): value is DashboardAggregateResult {
  if (value === null || typeof value !== "object") return false;
  const candidate = value as Partial<DashboardAggregateResult>;
  return (
    typeof candidate.rangeStartDate === "string" &&
    typeof candidate.rangeEndDate === "string" &&
    Array.isArray(candidate.buckets)
  );
}

/**
 * Fetches the bounded (14-day), role-scoped dashboard aggregate that feeds
 * the Agent multi-status trend chart and the Processor daily productivity
 * chart. Role scoping happens entirely in Apps Script from the session; this
 * client never supplies or trusts a client-side identity or date range. A
 * malformed/unexpected response shape is treated as a fetch failure (never
 * silently rendered), matching this client's other safe-parsing behavior.
 */
export async function fetchDashboardAggregate(): Promise<DashboardAggregateResult> {
  const result = await request<{ aggregate: unknown }>(
    "/api/applications/aggregate",
    { method: "GET" },
  );
  if (!isDashboardAggregateResult(result.aggregate))
    throw new DataApiError(
      "INTERNAL_ERROR",
      "The server returned an invalid response.",
    );
  return result.aggregate;
}
