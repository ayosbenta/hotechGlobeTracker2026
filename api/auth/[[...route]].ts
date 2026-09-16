import type { IncomingMessage, ServerResponse } from "node:http";

import { handleCsrfRoute } from "../../server/auth/routes/csrf.js";
import { handleLoginRoute } from "../../server/auth/routes/login.js";
import { handleLogoutRoute } from "../../server/auth/routes/logout.js";
import { handleMeRoute } from "../../server/auth/routes/me.js";
import {
  readJsonBody,
  toRouteRequest,
  writeRouteResponse,
} from "../../server/auth/vercel-adapter.js";
import { createRouteDependencies } from "../../server/auth/wiring.js";
import type {
  RouteDependencies,
  RouteRequest,
  RouteResponse,
} from "../../server/auth/route-types.js";

export const config = { runtime: "nodejs" };

function routeSegments(request: IncomingMessage, prefix: string): string[] {
  const path = request.url?.split("?")[0] ?? "";
  const trimmed = path.replace(prefix, "");
  return trimmed.split("/").filter(Boolean);
}

function notFound(): RouteResponse {
  return {
    status: 404,
    headers: { "content-type": "application/json" },
    cookies: [],
    body: { ok: false, error: { code: "NOT_FOUND" } },
  };
}

type AuthHandler = (
  request: RouteRequest,
  deps: RouteDependencies,
) => Promise<RouteResponse>;

const AUTH_ROUTES: Record<string, AuthHandler> = {
  csrf: handleCsrfRoute,
  login: handleLoginRoute,
  logout: handleLogoutRoute,
  me: handleMeRoute,
};

/** Unified handler for /api/auth/{csrf,login,logout,me}. */
export default async function handler(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const segments = routeSegments(request, "/api/auth");
  const body =
    request.method === "POST" ? await readJsonBody(request) : undefined;
  const routeRequest = toRouteRequest(request, body);

  const route =
    segments.length === 1 ? AUTH_ROUTES[segments[0] ?? ""] : undefined;
  const routeResponse = route
    ? await route(routeRequest, createRouteDependencies())
    : notFound();

  writeRouteResponse(response, routeResponse);
}
