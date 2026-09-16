import type { IncomingMessage, ServerResponse } from "node:http";

import {
  handleListUsersRoute,
  handleUpdateUserRoute,
} from "../../server/crud/routes/users.js";
import {
  readJsonBody,
  toRouteRequest,
  writeRouteResponse,
} from "../../server/auth/vercel-adapter.js";
import { createRouteDependencies } from "../../server/auth/wiring.js";
import type { RouteResponse } from "../../server/auth/route-types.js";

export const config = { runtime: "nodejs" };

function routeSegments(request: IncomingMessage): string[] {
  const path = request.url?.split("?")[0] ?? "";
  const trimmed = path.replace("/api/users", "");
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
 * Unified handler for /api/users:
 *   GET   /api/users
 *   PATCH /api/users/:userId
 */
export default async function handler(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const segments = routeSegments(request);
  const method = request.method ?? "GET";
  const body = method === "PATCH" ? await readJsonBody(request) : undefined;
  const routeRequest = toRouteRequest(request, body);
  const deps = createRouteDependencies();

  let routeResponse: RouteResponse;

  if (segments.length === 0) {
    routeResponse = await handleListUsersRoute(routeRequest, deps);
  } else if (segments.length === 1) {
    routeResponse = await handleUpdateUserRoute(
      routeRequest,
      deps,
      segments[0] ?? "",
    );
  } else {
    routeResponse = notFound();
  }

  writeRouteResponse(response, routeResponse);
}
