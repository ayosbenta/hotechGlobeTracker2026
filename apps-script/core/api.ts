import type { ApiResponse, Clock, UuidGenerator } from "./contracts";
import { createRequestContext } from "./runtime";
import { failure, success } from "./response";
import { parsePathInfo } from "./request";

export interface WebRequestEvent {
  pathInfo?: string;
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

/** No POST route is enabled until an approved, authenticated mutation phase. */
export function handlePost(
  _event: WebRequestEvent,
  dependencies: Pick<HealthDependencies, "clock" | "uuidGenerator">,
): ApiResponse<never> {
  const context = createRequestContext(
    dependencies.clock,
    dependencies.uuidGenerator,
  );
  return failure(context.requestId, "NOT_FOUND");
}
