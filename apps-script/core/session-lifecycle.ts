import type { Clock } from "./contracts";

export const SESSION_IDLE_SECONDS = 1800;
export const SESSION_ABSOLUTE_SECONDS = 28800;
export const SESSION_TOUCH_SECONDS = 300;
export interface SessionRecord {
  sessionId: string;
  userId: string;
  issuedAt: string;
  lastSeenAt: string;
  idleExpiresAt: string;
  absoluteExpiresAt: string;
  revokedAt: string | null;
  sessionVersion: number;
}
export type SessionDecision =
  "valid" | "revoked" | "expired" | "version_mismatch";
const seconds = (date: Date, value: number) =>
  new Date(date.getTime() + value * 1000).toISOString();
export function createSessionRecord(
  clock: Clock,
  values: { sessionId: string; userId: string; sessionVersion: number },
): SessionRecord {
  const now = clock.now();
  const issuedAt = now.toISOString();
  return {
    ...values,
    issuedAt,
    lastSeenAt: issuedAt,
    idleExpiresAt: seconds(now, SESSION_IDLE_SECONDS),
    absoluteExpiresAt: seconds(now, SESSION_ABSOLUTE_SECONDS),
    revokedAt: null,
  };
}
export function validateSession(
  record: SessionRecord,
  currentSessionVersion: number,
  clock: Clock,
): SessionDecision {
  const now = clock.now().getTime();
  if (record.revokedAt !== null) return "revoked";
  if (record.sessionVersion !== currentSessionVersion)
    return "version_mismatch";
  return now >= new Date(record.idleExpiresAt).getTime() ||
    now >= new Date(record.absoluteExpiresAt).getTime()
    ? "expired"
    : "valid";
}
export function touchSession(
  record: SessionRecord,
  currentSessionVersion: number,
  clock: Clock,
): SessionRecord {
  if (validateSession(record, currentSessionVersion, clock) !== "valid")
    return record;
  const now = clock.now();
  if (
    now.getTime() - new Date(record.lastSeenAt).getTime() <
    SESSION_TOUCH_SECONDS * 1000
  )
    return record;
  const idleExpiresAt = new Date(
    Math.min(
      now.getTime() + SESSION_IDLE_SECONDS * 1000,
      new Date(record.absoluteExpiresAt).getTime(),
    ),
  ).toISOString();
  return { ...record, lastSeenAt: now.toISOString(), idleExpiresAt };
}
export function revokeSession(
  record: SessionRecord,
  clock: Clock,
): SessionRecord {
  return record.revokedAt === null
    ? { ...record, revokedAt: clock.now().toISOString() }
    : record;
}
export function rotateSession(
  record: SessionRecord,
  next: { sessionId: string },
  clock: Clock,
): { revoked: SessionRecord; replacement: SessionRecord } {
  return {
    revoked: revokeSession(record, clock),
    replacement: createSessionRecord(clock, {
      sessionId: next.sessionId,
      userId: record.userId,
      sessionVersion: record.sessionVersion,
    }),
  };
}
