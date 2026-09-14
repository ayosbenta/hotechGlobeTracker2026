import type { ApplicationVersionSnapshot } from "./contracts";

export class StaleVersionError extends Error {
  constructor() {
    super("The supplied application version is stale.");
    this.name = "StaleVersionError";
  }
}

export function assertCurrentVersion(
  snapshot: ApplicationVersionSnapshot,
  expectedVersion: number,
): number {
  if (
    !Number.isInteger(expectedVersion) ||
    expectedVersion !== snapshot.version
  ) {
    throw new StaleVersionError();
  }
  return snapshot.version + 1;
}
