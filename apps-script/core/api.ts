import type { ApiResponse, Clock, UuidGenerator } from "./contracts";
import { createRequestContext } from "./runtime";
import { failure, success } from "./response";
import { parsePathInfo } from "./request";
import {
  handleInternalAuthRequest,
  INTERNAL_AUTH_PATH,
  type IngressDependencies,
  type IngressPostData,
} from "./auth-ingress";

export interface WebRequestEvent {
  pathInfo?: string;
  postData?: IngressPostData;
}

export interface HealthDependencies {
  clock: Clock;
  uuidGenerator: UuidGenerator;
  validateConfiguration(): void;
}

/** Phase 02's sole external route is non-sensitive and read-only. */
export function handleGet(
  event: WebRequestEvent,
  dependencies: HealthDependencies,
): ApiResponse<{ service: string; version: string; status: string }> {
  const context = createRequestContext(
    dependencies.clock,
    dependencies.uuidGenerator,
  );
  try {
    if (parsePathInfo(event.pathInfo) !== "/v1/health") {
      return failure(context.requestId, "NOT_FOUND");
    }
    dependencies.validateConfiguration();
    return success(
      context.requestId,
      { service: "hotech-globe-tracker", version: "v1", status: "ok" },
      dependencies.clock,
    );
  } catch {
    return failure(context.requestId, "INTERNAL_ERROR");
  }
}

export interface PostDependencies {
  clock: Clock;
  uuidGenerator: UuidGenerator;
  /**
   * Present only when the internal-auth ingress is wired. Its absence keeps
   * every other POST path on the frozen safe not-found behavior.
   */
  internalAuth?: IngressDependencies["executeInternalAuth"];
}

/**
 * The only routed POST path is the internal-auth ingress at
 * `/v1/internal/auth`; every other path retains the frozen safe NOT_FOUND
 * response.
 */
export function handlePost(
  event: WebRequestEvent,
  dependencies: PostDependencies,
): ApiResponse<unknown> {
  if (
    dependencies.internalAuth !== undefined &&
    parsePathInfo(event.pathInfo) === INTERNAL_AUTH_PATH
  ) {
    return handleInternalAuthRequest(event, {
      clock: dependencies.clock,
      uuidGenerator: dependencies.uuidGenerator,
      executeInternalAuth: dependencies.internalAuth,
    });
  }
  const context = createRequestContext(
    dependencies.clock,
    dependencies.uuidGenerator,
  );
  return failure(context.requestId, "NOT_FOUND");
}
