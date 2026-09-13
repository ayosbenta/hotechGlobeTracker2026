# Codex Working Rules

## Token-efficient context

1. Always read `PROJECT_MEMORY.md` and `NEXT_TASK.md` first.
2. Read only the requirement file relevant to the active task.
3. Search the codebase before opening large files.
4. Do not paste full logs or unchanged files into chat.
5. Report concise evidence: command, pass/fail, important count, blocker.
6. Keep `PROJECT_MEMORY.md` below roughly 1,200 words; record only durable truth.
7. Keep `NEXT_TASK.md` to one bounded phase and replace completed details with a short verified summary.

## Implementation discipline

- Work module-only; avoid unrelated refactors.
- Preserve user changes and inspect git status before/after work.
- Reuse components without flattening role-specific UX.
- Keep browser code independent of Google Sheets row positions.
- Use typed API contracts and adapters.
- Enforce authentication, authorization, and validation in Apps Script.
- Never expose secrets, raw Drive permissions, or direct Sheet access.
- Do not weaken tests to make them pass.
- Do not claim completion without running the relevant verification.

## Update format after each phase

```text
Outcome:
Changed:
Verified:
Known limitations:
Next recommended task:
Approval state: In Progress | Ready for Owner Review | Owner Approved
```

## Owner-approval rule

Only the owner may declare a phase `FINAL` or `Owner Approved`. Once approved, preserve it as a frozen baseline and document later changes as change requests.
