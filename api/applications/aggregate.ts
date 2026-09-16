import type { IncomingMessage, ServerResponse } from "node:http";

import { handleGetApplicationsAggregateRoute } from "../../server/crud/routes/applications";
import {
  readJsonBody,
  toRouteRequest,
  writeRouteResponse,
} from "../../server/auth/vercel-adapter";
import { createRouteDependencies } from "../../server/auth/wiring";

export const config = { runtime: "nodejs" };

/** GET /api/applications/aggregate — Admin/Agent/Processor, role-scoped by Apps Script. */
export default async function handler(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const body =
    request.method === "POST" ? await readJsonBody(request) : undefined;
  const routeRequest = toRouteRequest(request, body);
  const routeResponse = await handleGetApplicationsAggregateRoute(
    routeRequest,
    createRouteDependencies(),
  );
  writeRouteResponse(response, routeResponse);
}
