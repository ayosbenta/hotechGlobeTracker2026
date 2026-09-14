export interface PreprovisionedUser {
  userId: string;
  email: string;
  accountStatus: string;
  providerSubject: string | null;
}
export type FirstBindDecision =
  | "allow"
  | "lock_required"
  | "email_unverified"
  | "invalid_email"
  | "no_active_match"
  | "ambiguous_email"
  | "subject_already_bound"
  | "user_already_bound";
export function normalizeEmail(email: string): string | null {
  const normalized = email.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) ? normalized : null;
}
/** Policy only: the caller must hold the script lock before performing any write. */
export function decideFirstProviderBind(input: {
  lockHeld: boolean;
  emailVerified: boolean;
  email: string;
  providerSubject: string;
  users: readonly PreprovisionedUser[];
}): FirstBindDecision {
  if (!input.lockHeld) return "lock_required";
  if (!input.emailVerified) return "email_unverified";
  const email = normalizeEmail(input.email);
  if (email === null || !input.providerSubject) return "invalid_email";
  const matches = input.users.filter(
    (user) =>
      user.accountStatus === "Active" && normalizeEmail(user.email) === email,
  );
  const subjectOwner = input.users.find(
    (user) => user.providerSubject === input.providerSubject,
  );
  if (
    subjectOwner !== undefined &&
    !matches.some((item) => item.userId === subjectOwner.userId)
  )
    return "subject_already_bound";
  if (matches.length === 0) return "no_active_match";
  if (matches.length !== 1) return "ambiguous_email";
  if (subjectOwner !== undefined && subjectOwner.userId !== matches[0].userId)
    return "subject_already_bound";
  return matches[0].providerSubject === null ||
    matches[0].providerSubject === ""
    ? "allow"
    : matches[0].providerSubject === input.providerSubject
      ? "allow"
      : "user_already_bound";
}
