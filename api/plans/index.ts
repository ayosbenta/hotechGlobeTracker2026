import type { IncomingMessage, ServerResponse } from "node:http";

import {
  handleCreatePlanRoute,
  handleListPlansRoute,
} from "../../server/crud/routes/plans";
import {
  readJsonBody,
  toRouteRequest,
  writeRouteResponse,
} from "../../server/auth/vercel-adapter";
import { createRouteDependencies } from "../../server/auth/wiring";

export const config = { runtime: "nodejs" };

/** GET /api/plans (list) and POST /api/plans (Admin create). */
export default async function handler(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const body =
    request.method === "POST" ? await readJsonBody(request) : undefined;
  const routeRequest = toRouteRequest(request, body);
  const deps = createRouteDependencies();
  const routeResponse =
    request.method === "POST"
      ? await handleCreatePlanRoute(routeRequest, deps)
      : await handleListPlansRoute(routeRequest, deps);
  writeRouteResponse(response, routeResponse);
}
