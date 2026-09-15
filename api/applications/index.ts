import type { IncomingMessage, ServerResponse } from "node:http";

import {
  handleCreateApplicationRoute,
  handleListApplicationsRoute,
} from "../../server/crud/routes/applications";
import {
  readJsonBody,
  toRouteRequest,
  writeRouteResponse,
} from "../../server/auth/vercel-adapter";
import { createRouteDependencies } from "../../server/auth/wiring";

export const config = { runtime: "nodejs" };

/** GET /api/applications (list) and POST /api/applications (Admin/Agent create). */
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
      ? await handleCreateApplicationRoute(routeRequest, deps)
      : await handleListApplicationsRoute(routeRequest, deps);
  writeRouteResponse(response, routeResponse);
}
