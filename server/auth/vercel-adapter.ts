import type { IncomingMessage, ServerResponse } from "node:http";

import type { RouteRequest, RouteResponse } from "./route-types";

interface MinimalVercelRequest extends IncomingMessage {
  body?: unknown;
  cookies?: Record<string, string>;
}

function extractClientIp(request: IncomingMessage): string {
  const forwarded = request.headers["x-forwarded-for"];
  const first = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  const candidate = first?.split(",")[0]?.trim();
  return candidate || request.socket.remoteAddress || "unknown";
}

export function toRouteRequest(
  request: MinimalVercelRequest,
  body: unknown,
): RouteRequest {
  return {
    method: request.method ?? "GET",
    cookieHeader: request.headers.cookie ?? null,
    headers: request.headers as Record<string, string | string[] | undefined>,
    body,
    clientIp: extractClientIp(request),
  };
}

export function writeRouteResponse(
  response: ServerResponse,
  routeResponse: RouteResponse,
): void {
  response.statusCode = routeResponse.status;
  for (const [key, value] of Object.entries(routeResponse.headers)) {
    response.setHeader(key, value);
  }
  if (routeResponse.cookies.length > 0) {
    response.setHeader("Set-Cookie", routeResponse.cookies);
  }
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(routeResponse.body));
}

export async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return null;
  }
}
