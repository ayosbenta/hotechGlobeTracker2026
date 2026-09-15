import type { IncomingMessage, ServerResponse } from "node:http";

import { handleLogoutRoute } from "../../server/auth/routes/logout";
import {
  toRouteRequest,
  writeRouteResponse,
} from "../../server/auth/vercel-adapter";
import { createRouteDependencies } from "../../server/auth/wiring";

export const config = { runtime: "nodejs" };

export default async function handler(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const routeRequest = toRouteRequest(request, undefined);
  const routeResponse = await handleLogoutRoute(
    routeRequest,
    createRouteDependencies(),
  );
  writeRouteResponse(response, routeResponse);
}
