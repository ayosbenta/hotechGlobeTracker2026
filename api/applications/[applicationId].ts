import type { IncomingMessage, ServerResponse } from "node:http";

import {
  handleGetApplicationRoute,
  handleUpdateApplicationRoute,
} from "../../server/crud/routes/applications";
import {
  readJsonBody,
  toRouteRequest,
  writeRouteResponse,
} from "../../server/auth/vercel-adapter";
import { createRouteDependencies } from "../../server/auth/wiring";

export const config = { runtime: "nodejs" };

interface VercelRequestWithQuery extends IncomingMessage {
  query?: Record<string, string | string[]>;
}

function extractApplicationId(request: VercelRequestWithQuery): string {
  const fromQuery = request.query?.applicationId;
  if (typeof fromQuery === "string") return fromQuery;
  if (Array.isArray(fromQuery) && typeof fromQuery[0] === "string")
    return fromQuery[0];
  const path = request.url?.split("?")[0] ?? "";
  const segments = path.split("/").filter(Boolean);
  return segments[segments.length - 1] ?? "";
}

/** GET /api/applications/:applicationId and PATCH /api/applications/:applicationId. */
export default async function handler(
  request: VercelRequestWithQuery,
  response: ServerResponse,
): Promise<void> {
  const body =
    request.method === "PATCH" ? await readJsonBody(request) : undefined;
  const routeRequest = toRouteRequest(request, body);
  const applicationId = extractApplicationId(request);
  const deps = createRouteDependencies();
  const routeResponse =
    request.method === "PATCH"
      ? await handleUpdateApplicationRoute(routeRequest, deps, applicationId)
      : await handleGetApplicationRoute(routeRequest, deps, applicationId);
  writeRouteResponse(response, routeResponse);
}
