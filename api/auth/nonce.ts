import type { IncomingMessage, ServerResponse } from "node:http";

import { handleNonceRoute } from "../../server/auth/routes/nonce";
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
  const routeResponse = await handleNonceRoute(
    routeRequest,
    createRouteDependencies(),
  );
  writeRouteResponse(response, routeResponse);
}
