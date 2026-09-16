import type { IncomingMessage, ServerResponse } from "node:http";

import {
  handleAssignApplicationRoute,
  handleCreateApplicationRoute,
  handleGetApplicationRoute,
  handleGetApplicationsAggregateRoute,
  handleListApplicationsRoute,
  handleUpdateApplicationRoute,
} from "../../server/crud/routes/applications";
import {
  readJsonBody,
  toRouteRequest,
  writeRouteResponse,
} from "../../server/auth/vercel-adapter";
import { createRouteDependencies } from "../../server/auth/wiring";
import type { RouteResponse } from "../../server/auth/route-types";

export const config = { runtime: "nodejs" };

function routeSegments(request: IncomingMessage): string[] {
  const path = request.url?.split("?")[0] ?? "";
  const trimmed = path.replace("/api/applications", "");
  return trimmed.split("/").filter(Boolean);
}

function notFound(): RouteResponse {
  return {
    status: 404,
    headers: { "content-type": "application/json" },
    cookies: [],
    body: { ok: false, error: { code: "NOT_FOUND" } },
  };
}

/**
 * Unified handler for /api/applications:
 *   GET/POST  /api/applications
 *   GET       /api/applications/aggregate
 *   GET/PATCH /api/applications/:applicationId
 *   POST      /api/applications/:applicationId/assign
 */
export default async function handler(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const segments = routeSegments(request);
  const method = request.method ?? "GET";
  const body =
    method === "POST" || method === "PATCH"
      ? await readJsonBody(request)
      : undefined;
  const routeRequest = toRouteRequest(request, body);
  const deps = createRouteDependencies();

  let routeResponse: RouteResponse;

  if (segments.length === 0) {
    // Collection: list or create.
    routeResponse =
      method === "POST"
        ? await handleCreateApplicationRoute(routeRequest, deps)
        : await handleListApplicationsRoute(routeRequest, deps);
  } else if (segments.length === 1 && segments[0] === "aggregate") {
    // Literal `aggregate` must win before the :applicationId branch.
    routeResponse = await handleGetApplicationsAggregateRoute(
      routeRequest,
      deps,
    );
  } else if (segments.length === 2 && segments[1] === "assign") {
    routeResponse = await handleAssignApplicationRoute(
      routeRequest,
      deps,
      segments[0] ?? "",
    );
  } else if (segments.length === 1) {
    const applicationId = segments[0] ?? "";
    routeResponse =
      method === "PATCH"
        ? await handleUpdateApplicationRoute(routeRequest, deps, applicationId)
        : await handleGetApplicationRoute(routeRequest, deps, applicationId);
  } else {
    routeResponse = notFound();
  }

  writeRouteResponse(response, routeResponse);
}
