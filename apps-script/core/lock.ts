export const LOCK_WAIT_MS = 5_000;

export interface ScriptLock {
  tryLock(timeoutInMillis: number): boolean;
  releaseLock(): void;
}

export interface LockServiceAdapter {
  getScriptLock(): ScriptLock;
}

export class LockConflictError extends Error {
  constructor() {
    super("The requested lock could not be acquired.");
    this.name = "LockConflictError";
  }
}

export function withScriptLock<T>(
  lockService: LockServiceAdapter,
  operation: () => T,
): T {
  const lock = lockService.getScriptLock();
  let acquired = false;
  try {
    acquired = lock.tryLock(LOCK_WAIT_MS);
    if (!acquired) throw new LockConflictError();
    return operation();
  } finally {
    if (acquired) lock.releaseLock();
  }
}
