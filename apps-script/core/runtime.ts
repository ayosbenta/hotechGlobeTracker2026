import type { Clock, RequestContext, UuidGenerator } from "./contracts";

export function toUtcIso(date: Date): string {
  return date.toISOString();
}

export function createRequestContext(
  clock: Clock,
  uuidGenerator: UuidGenerator,
): RequestContext {
  return {
    requestId: uuidGenerator.generate(),
    receivedAt: toUtcIso(clock.now()),
  };
}

export const systemClock: Clock = {
  now: () => new Date(),
};

export function createAppsScriptUuidGenerator(utilities: {
  getUuid(): string;
}): UuidGenerator {
  return { generate: () => utilities.getUuid() };
}
