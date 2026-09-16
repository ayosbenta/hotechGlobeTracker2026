/**
 * Synthetic test-data helpers for the MVP-4 isolated CRUD acceptance run.
 * Mirrors the exact-prefix isolation pattern Phase 03B's acceptance suite
 * established (`__phase03b_test__`, see D-026): every synthetic row this
 * module builds is named with the literal prefix `__mvp4_test__`, and
 * `isMvp4SyntheticName` / `isMvp4SyntheticApplication` are the ONLY
 * predicates any cleanup step may use to decide what is safe to delete —
 * exact `startsWith` matching, never a fuzzy or partial match, so cleanup
 * can never touch a real, non-synthetic row.
 *
 * This module builds plain CRUD request payloads only; it performs no
 * network call and touches no real Sheet. The MVP-4 runner (or a future
 * live-execution step, out of scope for this stage) is responsible for
 * actually sending these payloads and later deleting anything matching the
 * prefix.
 */

export const MVP4_SYNTHETIC_PREFIX = "__mvp4_test__";

export function isMvp4SyntheticName(value: string): boolean {
  return value.startsWith(MVP4_SYNTHETIC_PREFIX);
}

export interface SyntheticPlanInput {
  planName: string;
  monthlyPrice: number;
  speedMbps: number;
}

/** Builds a plans_create payload for a synthetic, clearly-marked Plan. */
export function buildSyntheticPlanPayload(suffix: string): SyntheticPlanInput {
  return {
    planName: `${MVP4_SYNTHETIC_PREFIX}plan-${suffix}`,
    monthlyPrice: 999,
    speedMbps: 100,
  };
}

export interface SyntheticApplicationInput {
  customerFullName: string;
  mobileNumber: string;
  completeAddress: string;
  barangay: string;
  cityMunicipality: string;
  province: string;
  planId: string;
  notes: string;
}

/**
 * Builds an applications_create payload for a synthetic, clearly-marked
 * Application. `planId` must reference a Plan already created in this same
 * run (e.g. via buildSyntheticPlanPayload's resulting record) — this
 * function never invents or assumes a Plan id.
 */
export function buildSyntheticApplicationPayload(
  suffix: string,
  planId: string,
): SyntheticApplicationInput {
  return {
    customerFullName: `${MVP4_SYNTHETIC_PREFIX}customer-${suffix}`,
    mobileNumber: "09170000000",
    completeAddress: `${MVP4_SYNTHETIC_PREFIX}address-${suffix}`,
    barangay: `${MVP4_SYNTHETIC_PREFIX}barangay`,
    cityMunicipality: `${MVP4_SYNTHETIC_PREFIX}city`,
    province: `${MVP4_SYNTHETIC_PREFIX}province`,
    planId,
    notes: `${MVP4_SYNTHETIC_PREFIX}notes-${suffix}`,
  };
}

export interface MinimalApplicationRecord {
  applicationId: string;
  customerFullName: string;
}

export interface MinimalPlanRecord {
  planId: string;
  planName: string;
}

/**
 * Cleanup predicate for an Applications row returned by a list/create call.
 * Exact prefix match only, mirroring D-026's `startsWith`-only rule — never
 * a substring/contains match, which could accidentally match a real row
 * whose name happens to contain the marker text mid-string.
 */
export function isMvp4SyntheticApplication(
  record: MinimalApplicationRecord,
): boolean {
  return isMvp4SyntheticName(record.customerFullName);
}

/** Cleanup predicate for a Plans row, same exact-prefix rule. */
export function isMvp4SyntheticPlan(record: MinimalPlanRecord): boolean {
  return isMvp4SyntheticName(record.planName);
}

/**
 * Filters a list of records down to only those this module's own synthetic
 * builders could have produced. A cleanup step should never delete anything
 * this returns false for.
 */
export function selectMvp4SyntheticApplications<
  T extends MinimalApplicationRecord,
>(records: readonly T[]): readonly T[] {
  return records.filter(isMvp4SyntheticApplication);
}

export function selectMvp4SyntheticPlans<T extends MinimalPlanRecord>(
  records: readonly T[],
): readonly T[] {
  return records.filter(isMvp4SyntheticPlan);
}
