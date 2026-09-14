import type { ApplicationStatus } from "./contracts";

export interface TransitionInput {
  fromStatus: ApplicationStatus;
  toStatus: ApplicationStatus;
  notes?: string;
  jobOrderNumber?: string;
  installedAt?: string;
  /** Required when returning from Delayed; derived from history by a future workflow. */
  delayedFromStatus?: Exclude<
    ApplicationStatus,
    "Delayed" | "Cancelled/Rejected" | "Installed"
  >;
  /** Future authorization policy supplies this; never sourced from a client claim. */
  canReopenCancellation?: boolean;
}

export interface TransitionValidation {
  valid: boolean;
  issues: readonly string[];
}

const ACTIVE_STATUSES = [
  "Pending",
  "Transmitted",
  "With Job Order",
  "Ongoing",
] as const;
const JOB_ORDER_STATUSES = new Set<ApplicationStatus>([
  "With Job Order",
  "Ongoing",
  "Installed",
]);

const FORWARD_TRANSITIONS: Partial<
  Record<ApplicationStatus, ApplicationStatus>
> = {
  Pending: "Transmitted",
  Transmitted: "With Job Order",
  "With Job Order": "Ongoing",
  Ongoing: "Installed",
};

function hasText(value: string | undefined): boolean {
  return value !== undefined && value.trim().length > 0;
}

export function validateTransition(
  input: TransitionInput,
): TransitionValidation {
  const issues: string[] = [];
  const { fromStatus, toStatus } = input;
  let allowed = false;

  if (FORWARD_TRANSITIONS[fromStatus] === toStatus) allowed = true;
  if (
    ACTIVE_STATUSES.includes(fromStatus as (typeof ACTIVE_STATUSES)[number])
  ) {
    if (toStatus === "Delayed" || toStatus === "Cancelled/Rejected")
      allowed = true;
  }
  if (fromStatus === "Delayed" && input.delayedFromStatus === toStatus)
    allowed = true;
  if (
    fromStatus === "Cancelled/Rejected" &&
    toStatus === "Pending" &&
    input.canReopenCancellation === true
  ) {
    allowed = true;
  }

  if (!allowed)
    issues.push("The requested status transition is not permitted.");
  if (
    (toStatus === "Delayed" || toStatus === "Cancelled/Rejected") &&
    !hasText(input.notes)
  ) {
    issues.push(
      "Notes are required for Delayed and Cancelled/Rejected statuses.",
    );
  }
  if (JOB_ORDER_STATUSES.has(toStatus) && !hasText(input.jobOrderNumber)) {
    issues.push(
      "A job_order_number is required for With Job Order and later statuses.",
    );
  }
  if (toStatus === "Installed" && !hasText(input.installedAt)) {
    issues.push("An installed_at timestamp is required for Installed status.");
  }

  return { valid: issues.length === 0, issues };
}
