/**
 * Phase 02 deliberately has no persistent idempotency store: there are no
 * public mutation endpoints. This interface is reserved for the first
 * mutation phase, when retry storage and expiry semantics are approved.
 */
export interface IdempotencyStore<T> {
  find(requestId: string): T | null;
  save(requestId: string, value: T): void;
}

export function requireGeneratedRequestId(requestId: string): string {
  if (requestId.trim() === "")
    throw new Error("A server-generated request ID is required.");
  return requestId;
}
