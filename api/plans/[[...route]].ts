import type { IncomingMessage, ServerResponse } from "node:http";

import {
  handleCreatePlanRoute,
  handleListPlansRoute,
  handleUpdatePlanRoute,
} from "../../server/crud/routes/plans";
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
  const trimmed = path.replace("/api/plans", "");
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
 * Unified handler for /api/plans:
 *   GET/POST /api/plans
 *   PATCH    /api/plans/:planId
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
    routeResponse =
      method === "POST"
        ? await handleCreatePlanRoute(routeRequest, deps)
        : await handleListPlansRoute(routeRequest, deps);
  } else if (segments.length === 1) {
    routeResponse = await handleUpdatePlanRoute(
      routeRequest,
      deps,
      segments[0] ?? "",
    );
  } else {
    routeResponse = notFound();
  }

  writeRouteResponse(response, routeResponse);
}
