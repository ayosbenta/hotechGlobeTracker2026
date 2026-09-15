import type { IncomingMessage, ServerResponse } from "node:http";

import { handleLoginRoute } from "../../server/auth/routes/login";
import {
  readJsonBody,
  toRouteRequest,
  writeRouteResponse,
} from "../../server/auth/vercel-adapter";
import { createRouteDependencies } from "../../server/auth/wiring";

export const config = { runtime: "nodejs" };

export default async function handler(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const body =
    request.method === "POST" ? await readJsonBody(request) : undefined;
  const routeRequest = toRouteRequest(request, body);
  const routeResponse = await handleLoginRoute(
    routeRequest,
    createRouteDependencies(),
  );
  writeRouteResponse(response, routeResponse);
}
