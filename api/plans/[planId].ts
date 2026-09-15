import type { IncomingMessage, ServerResponse } from "node:http";

import { handleUpdatePlanRoute } from "../../server/crud/routes/plans";
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

function extractPlanId(request: VercelRequestWithQuery): string {
  const fromQuery = request.query?.planId;
  if (typeof fromQuery === "string") return fromQuery;
  if (Array.isArray(fromQuery) && typeof fromQuery[0] === "string")
    return fromQuery[0];
  // Fallback for a raw Node request without Vercel's parsed query (e.g. a
  // local dev harness): derive it from the URL path segment.
  const path = request.url?.split("?")[0] ?? "";
  const segments = path.split("/").filter(Boolean);
  return segments[segments.length - 1] ?? "";
}

/** PATCH /api/plans/:planId (Admin only). */
export default async function handler(
  request: VercelRequestWithQuery,
  response: ServerResponse,
): Promise<void> {
  const body =
    request.method === "PATCH" ? await readJsonBody(request) : undefined;
  const routeRequest = toRouteRequest(request, body);
  const planId = extractPlanId(request);
  const routeResponse = await handleUpdatePlanRoute(
    routeRequest,
    createRouteDependencies(),
    planId,
  );
  writeRouteResponse(response, routeResponse);
}
