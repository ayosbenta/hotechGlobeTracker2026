import type { IncomingMessage, ServerResponse } from "node:http";

import { handleCsrfRoute } from "../../server/auth/routes/csrf";
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
  const routeResponse = await handleCsrfRoute(
    routeRequest,
    createRouteDependencies(),
  );
  writeRouteResponse(response, routeResponse);
}
