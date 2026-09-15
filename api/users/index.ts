import type { IncomingMessage, ServerResponse } from "node:http";

import { handleListUsersRoute } from "../../server/crud/routes/users";
import {
  toRouteRequest,
  writeRouteResponse,
} from "../../server/auth/vercel-adapter";
import { createRouteDependencies } from "../../server/auth/wiring";

export const config = { runtime: "nodejs" };

/** GET /api/users (Admin-only, paginated/filterable list). */
export default async function handler(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const routeRequest = toRouteRequest(request, undefined);
  const deps = createRouteDependencies();
  const routeResponse = await handleListUsersRoute(routeRequest, deps);
  writeRouteResponse(response, routeResponse);
}
