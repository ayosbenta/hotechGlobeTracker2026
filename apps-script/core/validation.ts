import type { ValidationDetail } from "./contracts";

export function requiredText(
  field: string,
  value: string | undefined,
): ValidationDetail | null {
  return value === undefined || value.trim() === ""
    ? { field, issue: "is required" }
    : null;
}
