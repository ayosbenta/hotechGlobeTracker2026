export const APPLICATION_STATUS_VALUES = [
  "Pending",
  "Transmitted",
  "With Job Order",
  "Ongoing",
  "Installed",
  "Delayed",
  "Cancelled/Rejected",
] as const;

export type ApplicationStatus = (typeof APPLICATION_STATUS_VALUES)[number];
