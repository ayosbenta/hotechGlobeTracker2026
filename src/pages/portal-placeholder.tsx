import { ArrowRight, Construction, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { AppShell } from "@/components/app-shell";
import { ROLE_DEFINITIONS, type Role } from "@/types/roles";

interface PortalPlaceholderProps {
  readonly role: Role;
}

export function PortalPlaceholder({ role }: PortalPlaceholderProps) {
  const definition = ROLE_DEFINITIONS[role];

  return (
    <AppShell role={role}>
      <section aria-labelledby="portal-title" className="mx-auto max-w-4xl">
        <div className="rounded-3xl bg-gradient-to-br from-blue-700 via-blue-600 to-cyan-500 p-6 text-white shadow-panel sm:p-8">
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-cyan-100">
            {definition.label} portal
          </p>
          <h1
            className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl"
            id="portal-title"
          >
            The foundation is ready for your workflow.
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-blue-50 sm:text-base">
            {definition.description}
          </p>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <article className="rounded-2xl border border-blue-100 bg-white p-5 shadow-panel">
            <Construction aria-hidden="true" className="size-6 text-cyan-600" />
            <h2 className="mt-4 font-bold text-blue-950">
              Dashboard placeholder
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Role-specific dashboard content will be implemented in Phase 01
              while preserving the approved visual references.
            </p>
          </article>
          <article className="rounded-2xl border border-blue-100 bg-white p-5 shadow-panel">
            <ShieldCheck aria-hidden="true" className="size-6 text-cyan-600" />
            <h2 className="mt-4 font-bold text-blue-950">Access placeholder</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Authentication and server-enforced permissions are intentionally
              outside this foundation phase.
            </p>
          </article>
        </div>

        <Button className="mt-6" disabled>
          Coming in a later phase{" "}
          <ArrowRight aria-hidden="true" className="ml-2 size-4" />
        </Button>
      </section>
    </AppShell>
  );
}
