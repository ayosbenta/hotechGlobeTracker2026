import type { IncomingMessage, ServerResponse } from "node:http";

import { handleMeRoute } from "../../server/auth/routes/me";
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
  const routeResponse = await handleMeRoute(
    routeRequest,
    createRouteDependencies(),
  );
  writeRouteResponse(response, routeResponse);
}
